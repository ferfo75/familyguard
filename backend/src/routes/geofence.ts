import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { requireParentAuth } from "../middleware/auth";
import { broadcastToFamily } from "../socket";
import { sendPushToTokens } from "../utils/push";

export const geofenceRouter = Router();

const createSchema = z.object({
  name: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  radiusMeters: z.number().min(10).max(5000),
  childDeviceId: z.string().uuid().nullable().optional(),
});

geofenceRouter.get("/", requireParentAuth, async (req, res) => {
  const geofences = await db.geofence.findMany({ where: { parentId: req.parentId! } });
  res.json({ geofences });
});

geofenceRouter.post("/", requireParentAuth, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
  const geofence = await db.geofence.create({ data: { ...parsed.data, parentId: req.parentId! } });
  res.status(201).json({ geofence });
});

geofenceRouter.delete("/:id", requireParentAuth, async (req, res) => {
  const geofence = await db.geofence.findFirst({ where: { id: req.params.id, parentId: req.parentId! } });
  if (!geofence) return res.status(404).json({ error: "not_found" });
  await db.geofence.delete({ where: { id: geofence.id } });
  res.status(204).end();
});

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Estado en memoria de "¿el hijo está dentro de esta geocerca ahora mismo?"
// para solo emitir un evento cuando cambia de adentro a afuera o viceversa,
// no en cada ping de ubicación. Suficiente para un solo proceso de backend;
// si en el futuro se escala a varias instancias, esto debería moverse a Redis.
const insideState = new Map<string, boolean>(); // key: `${childDeviceId}:${geofenceId}`

export async function evaluateGeofencesForPing(childDeviceId: string, parentId: string, lat: number, lng: number) {
  const geofences = await db.geofence.findMany({
    where: { parentId, OR: [{ childDeviceId: null }, { childDeviceId }] },
  });

  for (const fence of geofences) {
    const distance = haversineMeters(lat, lng, fence.lat, fence.lng);
    const isInside = distance <= fence.radiusMeters;
    const key = `${childDeviceId}:${fence.id}`;
    const wasInside = insideState.get(key) ?? null;

    if (wasInside === null) {
      // Primera lectura para este par: solo fijamos el estado, sin disparar evento.
      insideState.set(key, isInside);
      continue;
    }
    if (wasInside === isInside) continue;

    insideState.set(key, isInside);
    const type = isInside ? "ENTER" : "EXIT";
    await db.geofenceEvent.create({ data: { geofenceId: fence.id, childDeviceId, type } });

    const child = await db.childDevice.findUnique({ where: { id: childDeviceId } });
    broadcastToFamily(parentId, "geofence:event", {
      geofenceId: fence.id,
      geofenceName: fence.name,
      childDeviceId,
      childName: child?.name,
      type,
      occurredAt: new Date(),
    });

    const tokens = (await db.pushToken.findMany({ where: { parentId } })).map((t) => t.token);
    const verb = isInside ? "entró a" : "salió de";
    await sendPushToTokens(tokens, "FamilyGuard", `${child?.name} ${verb} "${fence.name}"`);
  }
}
