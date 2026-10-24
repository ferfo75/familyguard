import { Router } from "express";
import { db } from "../db";
import { requireParentAuth } from "../middleware/auth";

export const placesRouter = Router();

const WINDOW_DAYS = 14;
// Agrupamos pings en una grilla de ~110m (1 milésima de grado): no es un
// clustering sofisticado, pero alcanza para detectar "pasa mucho tiempo
// cerca de acá" sin inventar nada que no esté en los datos reales.
const GRID_FACTOR = 1000;
const MIN_PINGS = 15;
const MIN_DISTINCT_DAYS = 3;
const MAX_PLACES = 6;

// Detecta en qué lugares pasó tiempo seguido en las últimas dos semanas,
// agrupando los pings de ubicación por cercanía. No es una predicción con
// IA: es un resumen honesto de patrones que ya están en el historial real
// (ej. "estuvo acá 9 días distintos, normalmente entre las 8 y las 13").
placesRouter.get("/:childDeviceId/frequent-places", requireParentAuth, async (req, res) => {
  const { childDeviceId } = req.params;
  const child = await db.childDevice.findFirst({ where: { id: childDeviceId, parentId: req.parentId! } });
  if (!child) return res.status(404).json({ error: "not_found" });

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000);
  const pings = await db.locationPing.findMany({
    where: { childDeviceId, recordedAt: { gte: since } },
    select: { lat: true, lng: true, recordedAt: true },
  });

  type Cluster = { lat: number; lng: number; count: number; days: Set<string>; hours: number[] };
  const clusters = new Map<string, Cluster>();

  for (const ping of pings) {
    const key = `${Math.round(ping.lat * GRID_FACTOR)},${Math.round(ping.lng * GRID_FACTOR)}`;
    const existing = clusters.get(key);
    const dayKey = ping.recordedAt.toISOString().slice(0, 10);
    const hour = ping.recordedAt.getUTCHours();
    if (existing) {
      existing.lat += ping.lat;
      existing.lng += ping.lng;
      existing.count += 1;
      existing.days.add(dayKey);
      existing.hours.push(hour);
    } else {
      clusters.set(key, { lat: ping.lat, lng: ping.lng, count: 1, days: new Set([dayKey]), hours: [hour] });
    }
  }

  const places = Array.from(clusters.values())
    .filter((c) => c.count >= MIN_PINGS && c.days.size >= MIN_DISTINCT_DAYS)
    .map((c) => ({
      lat: c.lat / c.count,
      lng: c.lng / c.count,
      visitDays: c.days.size,
      totalPings: c.count,
      typicalFromHour: Math.min(...c.hours),
      typicalToHour: Math.max(...c.hours),
    }))
    .sort((a, b) => b.totalPings - a.totalPings)
    .slice(0, MAX_PLACES);

  res.json({ places, windowDays: WINDOW_DAYS });
});
