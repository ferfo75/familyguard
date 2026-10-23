import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { requireChildAuth, requireParentAuth } from "../middleware/auth";
import { broadcastToFamily } from "../socket";
import { sendPushToTokens } from "../utils/push";

export const sosRouter = Router();

const sosSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  message: z.string().optional(),
  // Nota de voz corta que el hijo graba por su propia decisión al mandar la
  // alerta (no algo que el padre activa a distancia) — opcional, base64.
  audioClipBase64: z.string().max(2_000_000).optional(), // ~1.5MB en base64, de sobra para 15-20s comprimidos
});

// express.json() necesita un límite más alto para aceptar el audio en
// base64 sin cortar la request; se configura en src/index.ts.

// Botón de pánico: la app del hijo manda esto y el padre se entera al
// instante por socket.io + notificación push, con prioridad sobre cualquier
// otro evento.
sosRouter.post("/", requireChildAuth, async (req, res) => {
  const parsed = sosSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_input" });

  const alert = await db.sosAlert.create({ data: { childDeviceId: req.childDeviceId!, ...parsed.data } });
  const child = await db.childDevice.findUnique({ where: { id: req.childDeviceId! } });

  broadcastToFamily(req.parentId!, "sos:alert", {
    id: alert.id,
    childDeviceId: req.childDeviceId,
    childName: child?.name,
    lat: alert.lat,
    lng: alert.lng,
    message: alert.message,
    hasAudio: Boolean(alert.audioClipBase64),
    createdAt: alert.createdAt,
  });

  const tokens = (await db.pushToken.findMany({ where: { parentId: req.parentId! } })).map((t) => t.token);
  await sendPushToTokens(tokens, "🆘 Alerta de " + child?.name, alert.message || "Pidió ayuda. Tocá para ver su ubicación.");

  res.status(201).json({ ok: true, alert });
});

// Por si el hijo graba la nota de voz un ratito después de haber mandado ya
// la alerta (no queremos que grabar el audio demore el aviso instantáneo).
sosRouter.post("/:id/audio", requireChildAuth, async (req, res) => {
  const { audioClipBase64 } = z.object({ audioClipBase64: z.string().max(2_000_000) }).parse(req.body);
  const alert = await db.sosAlert.findFirst({ where: { id: req.params.id, childDeviceId: req.childDeviceId! } });
  if (!alert) return res.status(404).json({ error: "not_found" });
  await db.sosAlert.update({ where: { id: alert.id }, data: { audioClipBase64 } });
  res.json({ ok: true });
});

sosRouter.get("/", requireParentAuth, async (req, res) => {
  const alerts = await db.sosAlert.findMany({
    where: { childDevice: { parentId: req.parentId! } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { childDevice: { select: { name: true } } },
  });
  res.json({
    alerts: alerts.map((a) => ({
      id: a.id,
      childDeviceId: a.childDeviceId,
      childName: a.childDevice.name,
      lat: a.lat,
      lng: a.lng,
      message: a.message,
      audioClipBase64: a.audioClipBase64,
      createdAt: a.createdAt,
      resolvedAt: a.resolvedAt,
    })),
  });
});

sosRouter.post("/:id/resolve", requireParentAuth, async (req, res) => {
  const alert = await db.sosAlert.findFirst({
    where: { id: req.params.id, childDevice: { parentId: req.parentId! } },
  });
  if (!alert) return res.status(404).json({ error: "not_found" });
  await db.sosAlert.update({ where: { id: alert.id }, data: { resolvedAt: new Date() } });
  res.json({ ok: true });
});
