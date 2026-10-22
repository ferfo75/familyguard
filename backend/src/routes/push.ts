import { Router } from "express";
import { db } from "../db";
import { requireParentAuth } from "../middleware/auth";

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
