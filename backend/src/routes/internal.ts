import { Router } from "express";
import { db } from "../db";
import { sendPushToTokens } from "../utils/push";

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
    await sendPushToTokens(
      tokens,
      `📴 Sin noticias de ${child.name}`,
      `No reporta ubicación desde ${lastSeenLabel}. Revisá que tenga la app abierta y batería.`,
    );
    await db.childDevice.update({ where: { id: child.id }, data: { silenceAlertSentAt: new Date() } });
    notified += 1;
  }

  res.json({ checked: true, silentChildren: silentChildren.length, notified });
});
