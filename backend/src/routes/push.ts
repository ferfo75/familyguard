import { Router } from "express";
import { db } from "../db";
import { requireChildAuth, requireParentAuth } from "../middleware/auth";

export const pushRouter = Router();

// La app del padre registra su token de FCM al iniciar sesión / al refrescarlo.
pushRouter.post("/register", requireParentAuth, async (req, res) => {
  const token = String(req.body?.token ?? "").trim();
  if (!token) return res.status(400).json({ error: "token_required" });

  await db.pushToken.upsert({
    where: { token },
    update: { parentId: req.parentId! },
    create: { token, parentId: req.parentId!, platform: "android" },
  });
  res.status(201).json({ ok: true });
});

// Al cerrar sesión, ese celular deja de recibir las notificaciones de la familia.
pushRouter.post("/unregister", requireParentAuth, async (req, res) => {
  const token = String(req.body?.token ?? "").trim();
  if (!token) return res.status(400).json({ error: "token_required" });
  await db.pushToken.deleteMany({ where: { token, parentId: req.parentId! } });
  res.json({ ok: true });
});

// La app del hijo registra su token de FCM para que el servidor pueda "despertarla" si el seguimiento se duerme.
pushRouter.post("/child-register", requireChildAuth, async (req, res) => {
  const token = String(req.body?.token ?? "").trim();
  if (!token || token.length > 4096) return res.status(400).json({ error: "token_required" });
  // Un mismo token no puede quedar en dos hijos (por ejemplo, si se reemparejó el celular).
  await db.childDevice.updateMany({ where: { fcmToken: token, NOT: { id: req.childDeviceId! } }, data: { fcmToken: null } });
  await db.childDevice.update({ where: { id: req.childDeviceId! }, data: { fcmToken: token } });
  res.json({ ok: true });
});
