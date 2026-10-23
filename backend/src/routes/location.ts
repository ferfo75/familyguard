import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { requireChildAuth, requireParentAuth } from "../middleware/auth";
import { broadcastToFamily } from "../socket";
import { evaluateGeofencesForPing } from "./geofence";

export const locationRouter = Router();

const pingSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracyM: z.number().optional(),
  speedMs: z.number().min(0).optional(),
  batteryLevel: z.number().int().min(0).max(100).optional(),
});

// La app del hijo llama esto periódicamente (vía foreground service) con su
// posición actual. Guardamos el punto, actualizamos el estado del
// dispositivo, evaluamos geocercas y avisamos en tiempo real a la app del
// padre por socket.io.
locationRouter.post("/ping", requireChildAuth, async (req, res) => {
  const parsed = pingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
  const { lat, lng, accuracyM, speedMs, batteryLevel } = parsed.data;

  const ping = await db.locationPing.create({
    data: { childDeviceId: req.childDeviceId!, lat, lng, accuracyM, speedMs },
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
    recordedAt: ping.recordedAt,
  });

  await evaluateGeofencesForPing(req.childDeviceId!, req.parentId!, lat, lng);

  res.status(201).json({ ok: true });
});

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
          ? { lat: ping.lat, lng: ping.lng, speedMs: ping.speedMs, recordedAt: ping.recordedAt }
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
