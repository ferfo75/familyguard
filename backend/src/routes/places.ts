import { Router } from "express";
import { db } from "../db";
import { requireParentAuth } from "../middleware/auth";
import { clusterPings } from "../utils/clustering";

export const placesRouter = Router();

const WINDOW_DAYS = 14;
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

  const places = clusterPings(pings, { minPings: MIN_PINGS, minDistinctDays: MIN_DISTINCT_DAYS, maxPlaces: MAX_PLACES });
  res.json({ places, windowDays: WINDOW_DAYS });
});
