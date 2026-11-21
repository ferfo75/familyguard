import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { requireChildAuth, requireParentAuth } from "../middleware/auth";
import { broadcastToFamily } from "../socket";
import { sendPushToTokens } from "../utils/push";

/** Guarda una novedad para el padre y le avisa por push y en vivo. */
export async function recordFeed(parentId: string, childDeviceId: string, type: string, title: string, body = "") {
  const event = await db.feedEvent.create({ data: { parentId, childDeviceId, type, title, body } });
  const tokens = (await db.pushToken.findMany({ where: { parentId } })).map((t) => t.token);
  await sendPushToTokens(tokens, title, body);
  broadcastToFamily(parentId, "feed:new", { id: event.id, type });
  return event;
}

// Distancia en metros entre dos puntos (haversine), para saber si el hijo está dentro de una zona.
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ---- Novedades (lo ve el padre) ----------------------------------------------------------
export const feedRouter = Router();

feedRouter.get("/", requireParentAuth, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const events = await db.feedEvent.findMany({
    where: { parentId: req.parentId! },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { childDevice: { select: { name: true } } },
  });
  res.json({
    events: events.map((e) => ({
      id: e.id,
      childDeviceId: e.childDeviceId,
      childName: e.childDevice.name,
      type: e.type,
      title: e.title,
      body: e.body,
      createdAt: e.createdAt,
    })),
  });
});

// ---- "Llegué bien" / "Voy en camino" (lo manda el hijo/a) ---------------------------------
export const checkinsRouter = Router();

const checkinSchema = z
  .object({
    kind: z.enum(["arrived", "on_my_way"]),
    etaMinutes: z.number().int().min(1).max(180).optional(),
    note: z.string().trim().max(120).optional(),
  })
  .refine((d) => d.kind !== "on_my_way" || d.etaMinutes != null, { message: "eta_required", path: ["etaMinutes"] });

checkinsRouter.post("/", requireChildAuth, async (req, res) => {
  const parsed = checkinSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
  const { kind, etaMinutes, note } = parsed.data;

  const child = await db.childDevice.findUnique({ where: { id: req.childDeviceId! } });
  if (!child) return res.status(404).json({ error: "not_found" });

  // Si el último punto conocido cae dentro de una zona (casa, colegio…), se nombra.
  let placeName: string | null = null;
  const [lastPing, zones] = await Promise.all([
    db.locationPing.findFirst({ where: { childDeviceId: child.id }, orderBy: { recordedAt: "desc" } }),
    db.geofence.findMany({ where: { parentId: child.parentId, OR: [{ childDeviceId: null }, { childDeviceId: child.id }] } }),
  ]);
  if (lastPing) {
    const inside = zones.find((z) => distanceMeters(lastPing.lat, lastPing.lng, z.lat, z.lng) <= z.radiusMeters);
    placeName = inside?.name ?? null;
  }

  const extra = [note].filter(Boolean).join(" · ");
  const event =
    kind === "arrived"
      ? await recordFeed(child.parentId, child.id, "checkin_arrived", `🏠 ${child.name} llegó bien`, [placeName ? `En ${placeName}` : "", extra].filter(Boolean).join(" · "))
      : await recordFeed(child.parentId, child.id, "checkin_on_my_way", `🚶 ${child.name} va en camino`, [`Llega en ${etaMinutes} min`, extra].filter(Boolean).join(" · "));

  res.status(201).json({ ok: true, id: event.id, placeName });
});
