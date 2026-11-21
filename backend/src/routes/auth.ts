import { Router } from "express";
import { randomInt } from "node:crypto";
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

  const existing = (await db.parent.findUnique({ where: { email } })) ?? (await db.adult.findUnique({ where: { email } }));
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
  if (parent) {
    const ok = await bcrypt.compare(password, parent.passwordHash);
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });
    return res.json({ token: signParentToken(parent.id), parent: { id: parent.id, email: parent.email, name: parent.name, owner: true } });
  }
  // Adulto invitado (la madre, por ejemplo): entra a la misma familia con su propia cuenta.
  const adult = await db.adult.findUnique({ where: { email } });
  if (!adult) return res.status(401).json({ error: "invalid_credentials" });
  const ok = await bcrypt.compare(password, adult.passwordHash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });
  res.json({ token: signParentToken(adult.parentId, adult.id), parent: { id: adult.id, email: adult.email, name: adult.name, owner: false } });
});

// Sesión deslizante: mientras el token siga siendo válido se puede cambiar por uno nuevo,
// así que quien usa la app seguido no vuelve a ver el login. Un token vencido da 401.
authRouter.post("/refresh", requireParentAuth, async (req, res) => {
  if (req.adultId) {
    const adult = await db.adult.findUnique({ where: { id: req.adultId } });
    // Si el dueño lo quitó de la familia, la sesión deja de renovarse y la app vuelve al login.
    if (!adult || adult.parentId !== req.parentId) return res.status(401).json({ error: "invalid_token" });
    return res.json({ token: signParentToken(adult.parentId, adult.id), parent: { id: adult.id, email: adult.email, name: adult.name, owner: false } });
  }
  const parent = await db.parent.findUnique({ where: { id: req.parentId! } });
  if (!parent) return res.status(401).json({ error: "invalid_token" });
  res.json({ token: signParentToken(parent.id), parent: { id: parent.id, email: parent.email, name: parent.name, owner: true } });
});

// --- Otros adultos de la familia ---------------------------------------------

const MAX_ADULTS = 4;
const INVITE_MINUTES = 60;
// Sin 0/O/1/I/L para que se pueda dictar por teléfono sin confusiones. 8 caracteres de 31 = ~39 bits.
const INVITE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomInviteCode(): string {
  let out = "";
  for (let i = 0; i < 8; i++) out += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  return out;
}

// Límite simple en memoria contra adivinar códigos: 10 intentos fallidos por IP cada 15 minutos.
const failedRedeems = new Map<string, { n: number; since: number }>();
function tooManyRedeemAttempts(ip: string): boolean {
  const e = failedRedeems.get(ip);
  if (!e) return false;
  if (Date.now() - e.since > 15 * 60_000) { failedRedeems.delete(ip); return false; }
  return e.n >= 10;
}
function noteFailedRedeem(ip: string) {
  const e = failedRedeems.get(ip);
  if (!e || Date.now() - e.since > 15 * 60_000) failedRedeems.set(ip, { n: 1, since: Date.now() });
  else e.n += 1;
}
export function _resetRedeemLimiterForTests() { failedRedeems.clear(); }

// Cualquier adulto de la familia puede generar una invitación (un solo uso, vence en 1 hora).
authRouter.post("/adults/invite", requireParentAuth, async (req, res) => {
  const count = await db.adult.count({ where: { parentId: req.parentId! } });
  if (count >= MAX_ADULTS) return res.status(409).json({ error: "too_many_adults" });
  const invite = await db.adultInvite.create({
    data: { code: randomInviteCode(), parentId: req.parentId!, expiresAt: new Date(Date.now() + INVITE_MINUTES * 60_000) },
  });
  res.status(201).json({ code: invite.code, expiresAt: invite.expiresAt });
});

const redeemSchema = z.object({
  code: z.string().min(4),
  name: z.string().trim().min(1).max(60),
  email: z.string().email(),
  password: z.string().min(8),
});

// La madre ingresa el código en su celular y crea su propia cuenta dentro de la familia.
authRouter.post("/adults/redeem", async (req, res) => {
  const ip = req.ip || "?";
  if (tooManyRedeemAttempts(ip)) return res.status(429).json({ error: "too_many_attempts" });
  const parsed = redeemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
  const { name, email, password } = parsed.data;
  const code = parsed.data.code.trim().toUpperCase();

  const invite = await db.adultInvite.findUnique({ where: { code } });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    noteFailedRedeem(ip);
    return res.status(400).json({ error: "invalid_or_expired_code" });
  }
  const taken = (await db.parent.findUnique({ where: { email } })) ?? (await db.adult.findUnique({ where: { email } }));
  if (taken) return res.status(409).json({ error: "email_in_use" });

  const passwordHash = await bcrypt.hash(password, 12);
  // Marcar el código como usado y crear el adulto es una sola operación: dos celulares no pueden usar el mismo código.
  const claimed = await db.adultInvite.updateMany({ where: { id: invite.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) return res.status(400).json({ error: "invalid_or_expired_code" });
  const adult = await db.adult.create({ data: { parentId: invite.parentId, email, passwordHash, name } });
  res.status(201).json({ token: signParentToken(adult.parentId, adult.id), parent: { id: adult.id, email, name, owner: false } });
});

// Quiénes tienen acceso a la familia (para que el dueño pueda revisar y quitar un celular perdido).
authRouter.get("/adults", requireParentAuth, async (req, res) => {
  const [owner, adults] = await Promise.all([
    db.parent.findUnique({ where: { id: req.parentId! }, select: { name: true } }),
    db.adult.findMany({ where: { parentId: req.parentId! }, select: { id: true, name: true, email: true }, orderBy: { createdAt: "asc" } }),
  ]);
  res.json({
    me: { owner: !req.adultId },
    owner: { name: owner?.name ?? "" },
    adults,
  });
});

// Solo la cuenta principal puede quitar a un adulto: su sesión deja de renovarse y su app vuelve al login.
authRouter.delete("/adults/:id", requireParentAuth, async (req, res) => {
  if (req.adultId) return res.status(403).json({ error: "only_owner" });
  const removed = await db.adult.deleteMany({ where: { id: String(req.params.id), parentId: req.parentId! } });
  if (removed.count === 0) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
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
