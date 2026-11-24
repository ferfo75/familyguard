import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { requireChildAuth, requireParentAuth } from "../middleware/auth";
import { broadcastToFamily } from "../socket";
import { evaluateGeofencesForPing } from "./geofence";
import { sendPushToTokens } from "../utils/push";

const LOW_BATTERY_THRESHOLD = 15;
const MIN_TRIP_PINGS = 3; // evita avisar "viaje" por un par de lecturas ruidosas
const MIN_TRIP_MINUTES = 2;

export const locationRouter = Router();

const ACTIVITY_TYPES = ["walking", "running", "bicycle", "vehicle", "still"] as const;

// Estado de salud del teléfono, informado por la app del hijo en cada ping y en el latido.
const healthSchema = z.object({
  batteryUnrestricted: z.boolean().optional(),
  backgroundLocation: z.boolean().optional(),
  locationEnabled: z.boolean().optional(),
  appVersion: z.string().max(30).optional(),
});
type Health = z.infer<typeof healthSchema>;

function healthData(h?: Health) {
  if (!h) return {};
  return {
    healthBatteryUnrestricted: h.batteryUnrestricted,
    healthBackgroundLocation: h.backgroundLocation,
    healthLocationEnabled: h.locationEnabled,
    healthAppVersion: h.appVersion,
    healthAt: new Date(),
  };
}

// Un ping "atrasado" es uno que el teléfono guardó mientras no había señal (o el
// servidor dormía) y manda ahora, con la hora real en que se tomó. Se acepta hasta
// 48 h hacia atrás; no se acepta del futuro (con 2 min de tolerancia por el reloj).
const MAX_BACKFILL_MS = 48 * 3600 * 1000;
const CLOCK_SKEW_MS = 2 * 60 * 1000;
const LIVE_WINDOW_MS = 3 * 60 * 1000;

const pingSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracyM: z.number().optional(),
  speedMs: z.number().min(0).optional(),
  batteryLevel: z.number().int().min(0).max(100).optional(),
  activityType: z.enum(ACTIVITY_TYPES).optional(),
  recordedAt: z.string().datetime().optional(),
  health: healthSchema.optional(),
});

const heartbeatSchema = z.object({
  batteryLevel: z.number().int().min(0).max(100).optional(),
  health: healthSchema.optional(),
});

// La app del hijo llama esto periódicamente (vía foreground service) con su
// posición actual. Guardamos el punto, actualizamos el estado del
// dispositivo, evaluamos geocercas y avisamos en tiempo real a la app del
// padre por socket.io.
locationRouter.post("/ping", requireChildAuth, async (req, res) => {
  const parsed = pingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
  const { lat, lng, accuracyM, speedMs, batteryLevel, activityType, health } = parsed.data;

  const nowMs = Date.now();
  let recordedAt = new Date(nowMs);
  if (parsed.data.recordedAt) {
    const t = Date.parse(parsed.data.recordedAt);
    // Demasiado viejo: no se guarda (no tiene sentido como ubicación ni como "ahora").
    if (Number.isFinite(t) && t < nowMs - MAX_BACKFILL_MS) {
      return res.status(200).json({ ok: true, ignored: "too_old" });
    }
    // Un reloj del teléfono apenas adelantado se trata como "ahora"; si no, se respeta la hora real.
    if (Number.isFinite(t)) recordedAt = new Date(Math.min(t, nowMs));
  }

  // Ping atrasado: solo se guarda en el historial. No mueve el marcador del padre, no
  // dispara geocercas ni avisos (serían avisos viejos como si fueran de ahora). Si ya
  // existe uno con esa misma hora se ignora, porque el teléfono puede reintentar un
  // envío que en realidad sí había llegado.
  if (nowMs - recordedAt.getTime() > LIVE_WINDOW_MS) {
    const existing = await db.locationPing.findFirst({
      where: { childDeviceId: req.childDeviceId!, recordedAt },
      select: { id: true },
    });
    if (!existing) {
      await db.locationPing.create({
        data: { childDeviceId: req.childDeviceId!, lat, lng, accuracyM, speedMs, activityType, recordedAt },
      });
    }
    await db.childDevice.update({
      where: { id: req.childDeviceId! },
      data: { lastSeenAt: new Date(), batteryLevel, silenceAlertSentAt: null, ...healthData(health) },
    });
    return res.status(201).json({ ok: true, backfilled: true });
  }

  // Se piden ANTES de guardar el ping nuevo: son el estado "antes de este
  // mensaje", lo que hace falta para detectar un cruce (batería que recién
  // ahora bajó del umbral, un viaje que recién ahora terminó) en vez de
  // avisar de nuevo en cada ping mientras la condición sigue igual.
  const [previousChild, previousPing] = await Promise.all([
    db.childDevice.findUnique({ where: { id: req.childDeviceId! } }),
    db.locationPing.findFirst({ where: { childDeviceId: req.childDeviceId! }, orderBy: { recordedAt: "desc" } }),
  ]);

  const ping = await db.locationPing.create({
    data: { childDeviceId: req.childDeviceId!, lat, lng, accuracyM, speedMs, activityType },
  });
  await db.childDevice.update({
    where: { id: req.childDeviceId! },
    // silenceAlertSentAt se limpia acá: si antes se avisó "dejó de
    // reportar" y ahora volvió a mandar un ping, el próximo silencio tiene
    // que poder avisar de nuevo en vez de quedar apagado para siempre.
    data: { lastSeenAt: new Date(), batteryLevel, silenceAlertSentAt: null, ...healthData(health) },
  });

  broadcastToFamily(req.parentId!, "location:update", {
    childDeviceId: req.childDeviceId,
    lat,
    lng,
    accuracyM,
    speedMs,
    batteryLevel,
    activityType,
    recordedAt: ping.recordedAt,
  });

  await evaluateGeofencesForPing(req.childDeviceId!, req.parentId!, lat, lng);

  const childName = previousChild?.name ?? "Tu hijo/a";
  await Promise.all([
    notifyIfLowBattery(req.parentId!, childName, previousChild?.batteryLevel ?? null, batteryLevel),
    notifyIfTripCompleted(req.parentId!, req.childDeviceId!, childName, previousPing?.activityType ?? null, activityType, previousPing?.recordedAt ?? null),
  ]);

  res.status(201).json({ ok: true });
});

// Latido: la app del hijo avisa "estoy viva" cada ~15 min aunque no consiga GPS. No toca
// lastSeenAt (que significa "último ping de ubicación"): así el padre puede ver "la app
// está activa pero no manda ubicación" en vez de confundirlo con "app detenida".
locationRouter.post("/heartbeat", requireChildAuth, async (req, res) => {
  const parsed = heartbeatSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
  await db.childDevice.update({
    where: { id: req.childDeviceId! },
    data: { lastHeartbeatAt: new Date(), batteryLevel: parsed.data.batteryLevel, ...healthData(parsed.data.health) },
  });
  res.json({ ok: true });
});

// Avisa una sola vez por "cruce": cuando la batería pasa de estar por
// encima del umbral a estar por debajo. Si se queda baja, no insiste en
// cada ping siguiente.
async function notifyIfLowBattery(
  parentId: string,
  childName: string,
  previousBattery: number | null,
  currentBattery: number | undefined,
) {
  if (currentBattery == null) return;
  const wasAboveThreshold = previousBattery == null || previousBattery > LOW_BATTERY_THRESHOLD;
  if (!wasAboveThreshold || currentBattery > LOW_BATTERY_THRESHOLD) return;

  const tokens = (await db.pushToken.findMany({ where: { parentId } })).map((t) => t.token);
  await sendPushToTokens(tokens, `🔋 Batería baja — ${childName}`, `Le queda ${currentBattery}% de batería.`);
}

// Avisa cuando se detecta que terminó un tramo seguido viajando en
// auto/micro (activityType "vehicle"): mide la duración desde que empezó
// ese tramo hasta el último ping en el que todavía estaba en el vehículo.
async function notifyIfTripCompleted(
  parentId: string,
  childDeviceId: string,
  childName: string,
  previousActivity: string | null,
  currentActivity: string | undefined,
  previousPingAt: Date | null,
) {
  if (previousActivity !== "vehicle" || currentActivity === "vehicle" || !previousPingAt) return;

  const recentPings = await db.locationPing.findMany({
    where: { childDeviceId, recordedAt: { lte: previousPingAt } },
    orderBy: { recordedAt: "desc" },
    take: 200,
    select: { activityType: true, recordedAt: true },
  });

  let tripStartAt = previousPingAt;
  let vehiclePingCount = 0;
  for (const p of recentPings) {
    if (p.activityType !== "vehicle") break;
    tripStartAt = p.recordedAt;
    vehiclePingCount += 1;
  }

  const durationMin = Math.round((previousPingAt.getTime() - tripStartAt.getTime()) / 60_000);
  if (vehiclePingCount < MIN_TRIP_PINGS || durationMin < MIN_TRIP_MINUTES) return;

  const tokens = (await db.pushToken.findMany({ where: { parentId } })).map((t) => t.token);
  await sendPushToTokens(tokens, `🚗 Viaje completado — ${childName}`, `Duró ${durationMin} min en auto/micro.`);
}

// La app del padre consulta la última posición conocida de cada hijo.
locationRouter.get("/latest", requireParentAuth, async (req, res) => {
  const children = await db.childDevice.findMany({ where: { parentId: req.parentId! } });
  const latest = await Promise.all(
    children.map(async (child) => {
      const ping = await db.locationPing.findFirst({
        where: { childDeviceId: child.id },
        orderBy: { recordedAt: "desc" },
      });
      return {
        childDeviceId: child.id,
        childName: child.name,
        batteryLevel: child.batteryLevel,
        lastSeenAt: child.lastSeenAt,
        lastHeartbeatAt: child.lastHeartbeatAt,
        // Diagnóstico: ¿el celular registró su token de avisos? ¿cuándo se le mandó el último aviso de despertar?
        pushRegistered: child.fcmToken != null,
        lastWakeAt: child.lastWakeAt,
        health: child.healthAt
          ? {
              batteryUnrestricted: child.healthBatteryUnrestricted,
              backgroundLocation: child.healthBackgroundLocation,
              locationEnabled: child.healthLocationEnabled,
              appVersion: child.healthAppVersion,
              at: child.healthAt,
            }
          : null,
        location: ping
          ? { lat: ping.lat, lng: ping.lng, speedMs: ping.speedMs, activityType: ping.activityType, recordedAt: ping.recordedAt }
          : null,
      };
    })
  );
  res.json({ children: latest });
});

// Historial de recorrido de un día para dibujar la polyline en el mapa.
locationRouter.get("/:childDeviceId/history", requireParentAuth, async (req, res) => {
  const { childDeviceId } = req.params;
  const child = await db.childDevice.findFirst({ where: { id: childDeviceId, parentId: req.parentId! } });
  if (!child) return res.status(404).json({ error: "not_found" });

  const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 24 * 3600 * 1000);
  const pings = await db.locationPing.findMany({
    where: { childDeviceId, recordedAt: { gte: from } },
    orderBy: { recordedAt: "asc" },
    select: { lat: true, lng: true, speedMs: true, recordedAt: true },
  });
  res.json({ points: pings });
});
