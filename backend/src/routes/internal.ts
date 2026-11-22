import { Router } from "express";
import { db } from "../db";
import { sendPushToTokens, sendWakePush } from "../utils/push";
import { shouldWake } from "../utils/wake";

export const internalRouter = Router();

const SILENCE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 horas

// Lo llama un cron externo gratuito cada 15 minutos (ver README de
// deploy): revisa todos los hijos y avisa al padre por push si alguno
// dejó de reportar ubicación hace más de 2 horas. Hace falta un disparador
// externo porque, a diferencia de los otros avisos (batería baja, viaje
// completado), este caso es justamente "no llegó ningún ping" — no hay
// ningún pedido propio del hijo del que colgarse para detectarlo, y
// Render (plan gratis) duerme el servicio si nadie lo golpea.
internalRouter.post("/check-silence", async (req, res) => {
  const secret = req.header("x-internal-secret");
  if (!process.env.INTERNAL_CRON_SECRET || secret !== process.env.INTERNAL_CRON_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const threshold = new Date(Date.now() - SILENCE_THRESHOLD_MS);
  const silentChildren = await db.childDevice.findMany({
    where: {
      lastSeenAt: { lt: threshold },
      silenceAlertSentAt: null,
    },
  });

  let notified = 0;
  for (const child of silentChildren) {
    const tokens = (await db.pushToken.findMany({ where: { parentId: child.parentId } })).map((t) => t.token);
    const lastSeenLabel = child.lastSeenAt ? child.lastSeenAt.toLocaleString("es-AR") : "nunca";
    // Con el latido se puede decir QUÉ pasa: la app viva pero sin GPS, o la app directamente detenida.
    const heartbeatRecent = child.lastHeartbeatAt != null && Date.now() - child.lastHeartbeatAt.getTime() < 40 * 60 * 1000;
    let body: string;
    if (heartbeatRecent) {
      body = `La app está activa pero no manda ubicación desde ${lastSeenLabel}. Revisá que tenga el GPS prendido y el permiso de ubicación "todo el tiempo".`;
    } else if (child.healthBatteryUnrestricted === false) {
      body = `No reporta desde ${lastSeenLabel}. Tiene la batería restringida: es la causa más común en Motorola. Abrí la app del hijo/a y poné "Sin restricciones".`;
    } else {
      body = `No reporta ubicación desde ${lastSeenLabel}. Puede estar apagado, sin datos, o con la app detenida: conviene abrirla una vez.`;
    }
    await sendPushToTokens(tokens, `📴 Sin noticias de ${child.name}`, body);
    await db.childDevice.update({ where: { id: child.id }, data: { silenceAlertSentAt: new Date() } });
    notified += 1;
  }

  // Antes de preocupar al padre: si el seguimiento de un hijo se durmió, se le manda un aviso de máxima prioridad
  // al celular para que la app vuelva a arrancar sola (hace falta que haya registrado su token de FCM).
  const candidates = await db.childDevice.findMany({ where: { fcmToken: { not: null } } });
  let woken = 0;
  for (const c of candidates) {
    if (!shouldWake(c)) continue;
    const r = await sendWakePush(c.fcmToken!);
    await db.childDevice.update({ where: { id: c.id }, data: { lastWakeAt: new Date(), ...(r === "invalid" ? { fcmToken: null } : {}) } });
    if (r === "ok") woken += 1;
  }

  res.json({ checked: true, silentChildren: silentChildren.length, notified, woken });
});
