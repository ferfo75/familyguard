import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../db";
import { requireParentAuth, signChildDeviceToken, signParentToken } from "../middleware/auth";

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
  const { email, password, name } = parsed.data;

  const existing = await db.parent.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "email_in_use" });

  const passwordHash = await bcrypt.hash(password, 12);
  const parent = await db.parent.create({ data: { email, passwordHash, name } });
  res.status(201).json({ token: signParentToken(parent.id), parent: { id: parent.id, email, name } });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
  const { email, password } = parsed.data;

  const parent = await db.parent.findUnique({ where: { email } });
  if (!parent) return res.status(401).json({ error: "invalid_credentials" });
  const ok = await bcrypt.compare(password, parent.passwordHash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });

  res.json({ token: signParentToken(parent.id), parent: { id: parent.id, email: parent.email, name: parent.name } });
});

// --- Emparejamiento padre <-> hijo -----------------------------------------

function randomSixDigitCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// El padre genera un código de 6 dígitos (válido 15 minutos) desde su app.
authRouter.post("/pairing/create", requireParentAuth, async (req, res) => {
  const childName = String(req.body?.childName ?? "").trim();
  if (!childName) return res.status(400).json({ error: "child_name_required" });

  const code = randomSixDigitCode();
  const pairing = await db.pairingCode.create({
    data: {
      code,
      parentId: req.parentId!,
      childName,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });
  res.status(201).json({ code: pairing.code, expiresAt: pairing.expiresAt });
});

// La app del hijo escribe ese código una sola vez para quedar emparejada.
// A cambio recibe un deviceToken de larga duración que usa en todas las
// llamadas siguientes (no vuelve a pedir login).
authRouter.post("/pairing/redeem", async (req, res) => {
  const code = String(req.body?.code ?? "").trim();
  const deviceModel = req.body?.deviceModel ? String(req.body.deviceModel) : undefined;
  if (!code) return res.status(400).json({ error: "code_required" });

  const pairing = await db.pairingCode.findUnique({ where: { code } });
  if (!pairing || pairing.usedAt || pairing.expiresAt < new Date()) {
    return res.status(400).json({ error: "invalid_or_expired_code" });
  }

  const childDevice = await db.childDevice.create({
    data: {
      parentId: pairing.parentId,
      name: pairing.childName,
      deviceModel,
      deviceToken: "pending", // se reemplaza abajo una vez que conocemos el id
    },
  });
  const deviceToken = signChildDeviceToken(childDevice.id, pairing.parentId);
  await db.childDevice.update({ where: { id: childDevice.id }, data: { deviceToken } });
  await db.pairingCode.update({ where: { id: pairing.id }, data: { usedAt: new Date() } });

  res.status(201).json({ deviceToken, childDeviceId: childDevice.id, childName: childDevice.name });
});
