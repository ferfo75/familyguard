import { Router } from "express";
import { db } from "../db";
import { requireParentAuth } from "../middleware/auth";
import { isChildConnected, sendCommandToChild } from "../socket";

export const commandsRouter = Router();

// El padre pide que el celular del hijo suene fuerte (por canal de alarma,
// así suena aunque el teléfono esté en silencio o vibrador) para
// encontrarlo, igual que "hacer sonar" en Find My Device. El comando viaja
// por socket.io en tiempo real; si el hijo no tiene conexión en ese momento
// (wifi/datos cortados), avisamos que no se pudo en vez de fallar mudo.
commandsRouter.post("/:childDeviceId/ring", requireParentAuth, async (req, res) => {
  const { childDeviceId } = req.params;
  const child = await db.childDevice.findFirst({ where: { id: childDeviceId, parentId: req.parentId! } });
  if (!child) return res.status(404).json({ error: "not_found" });

  const connected = await isChildConnected(childDeviceId);
  if (!connected) {
    return res.status(409).json({ error: "child_offline", message: "El dispositivo no está conectado ahora mismo." });
  }

  sendCommandToChild(childDeviceId, "command:ring", { requestedAt: new Date() });
  res.json({ ok: true });
});

// Para cuando se tocó "Hacer sonar" sin querer, o el chico no llega a la
// pantalla a tiempo: el padre lo puede cortar también desde su propia app,
// no solo el botón que aparece en el teléfono del hijo.
commandsRouter.post("/:childDeviceId/stop-ring", requireParentAuth, async (req, res) => {
  const { childDeviceId } = req.params;
  const child = await db.childDevice.findFirst({ where: { id: childDeviceId, parentId: req.parentId! } });
  if (!child) return res.status(404).json({ error: "not_found" });

  sendCommandToChild(childDeviceId, "command:stopRing", {});
  res.json({ ok: true });
});
