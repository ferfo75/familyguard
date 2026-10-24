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

const pingSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracyM: z.number().optional(),
  speedMs: z.number().min(0).optional(),
  batteryLevel: z.number().int().min(0).max(100).optional(),
  activityType: z.enum(ACTIVITY_TYPES).optional(),
});

// La app del hijo llama esto periódicamente (vía foreground service) con su
// posición actual. Guardamos el punto, actualizamos el estado del
// dispositivo, evaluamos geocercas y avisamos en tiempo real a la app del
// padre por socket.io.
locationRouter.post("/ping", requireChildAuth, async (req, res) => {
  const parsed = pingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
  const { lat, lng, accuracyM, speedMs, batteryLevel, activityType } = parsed.data;

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
    data: { lastSeenAt: new Date(), batteryLevel },
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
