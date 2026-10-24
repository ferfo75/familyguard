import { Router } from "express";
import { db } from "../db";
import { requireParentAuth } from "../middleware/auth";
import { clusterPings, detectActivitySegments } from "../utils/clustering";
import { generateText } from "../utils/gemini";

export const summaryRouter = Router();

const ACTIVITY_LABELS: Record<string, string> = {
  walking: "caminando",
  running: "corriendo",
  bicycle: "en bici",
  vehicle: "en auto/micro",
  still: "quieto",
};

// Arma un resumen en lenguaje natural del día de un hijo/a, a partir de
// datos reales (lugares donde pasó tiempo, viajes en auto, alertas SOS,
// batería). Si hay clave de Gemini configurada, un modelo de IA lo redacta
// de forma amigable; si no, se arma un resumen igual de honesto pero con
// texto fijo en vez de generado — la función no depende de tener IA.
summaryRouter.get("/:childDeviceId/daily-summary", requireParentAuth, async (req, res) => {
  const { childDeviceId } = req.params;
  const child = await db.childDevice.findFirst({ where: { id: childDeviceId, parentId: req.parentId! } });
  if (!child) return res.status(404).json({ error: "not_found" });

  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const pings = await db.locationPing.findMany({
    where: { childDeviceId, recordedAt: { gte: since } },
    orderBy: { recordedAt: "asc" },
    select: { lat: true, lng: true, activityType: true, recordedAt: true },
  });
  const sosAlerts = await db.sosAlert.findMany({
    where: { childDeviceId, createdAt: { gte: since } },
    select: { createdAt: true, resolvedAt: true },
  });

  if (pings.length === 0) {
    return res.json({ summary: `Todavía no hay ubicaciones registradas de ${child.name} en las últimas 24 horas.`, generatedByAi: false });
  }

  const places = clusterPings(pings, { minPings: 5, minDistinctDays: 1, maxPlaces: 5 });
  const trips = detectActivitySegments(pings)
    .filter((s) => s.activityType === "vehicle" && s.pingCount >= 3)
    .map((s) => ({ ...s, minutes: Math.round((s.endAt.getTime() - s.startAt.getTime()) / 60_000) }))
    .filter((s) => s.minutes >= 2);

  const facts: string[] = [];
  if (child.batteryLevel != null) facts.push(`Batería actual del teléfono: ${child.batteryLevel}%.`);
  for (const place of places) {
    facts.push(
      `Pasó tiempo cerca de lat ${place.lat.toFixed(4)}, lng ${place.lng.toFixed(4)}, ` +
        `entre las ${String(place.typicalFromHour).padStart(2, "0")}:00 y las ${String(place.typicalToHour).padStart(2, "0")}:00.`,
    );
  }
  for (const trip of trips) {
    facts.push(`Viajó en auto/micro ${trip.minutes} minutos (de ${trip.startAt.toLocaleTimeString("es-AR")} a ${trip.endAt.toLocaleTimeString("es-AR")}).`);
  }
  for (const alert of sosAlerts) {
    facts.push(
      alert.resolvedAt
        ? `Mandó una alerta de pánico a las ${alert.createdAt.toLocaleTimeString("es-AR")}, ya marcada como resuelta.`
        : `Mandó una alerta de pánico a las ${alert.createdAt.toLocaleTimeString("es-AR")} que TODAVÍA NO fue marcada como resuelta.`,
    );
  }

  const aiSummary = await generateText(
    `Sos un asistente que le resume a un padre/madre lo que hizo su hijo/a hoy, ` +
      `usando SOLO estos datos reales (no inventes nada que no esté acá):\n\n` +
      facts.map((f) => `- ${f}`).join("\n") +
      `\n\nEscribí un resumen breve (2 a 4 oraciones), en español, tono cálido y cercano, ` +
      `sin tecnicismos. Si hay una alerta de pánico sin resolver, mencionala primero y con claridad. ` +
      `No uses coordenadas crudas (lat/lng) en el texto, referite a esos lugares simplemente como "un lugar donde pasó tiempo".`,
  );

  const summary =
    aiSummary ??
    (facts.length > 0
      ? `Resumen del día de ${child.name}: ` + facts.join(" ")
      : `No se detectó actividad relevante de ${child.name} en las últimas 24 horas.`);

  res.json({ summary, generatedByAi: aiSummary != null });
});
