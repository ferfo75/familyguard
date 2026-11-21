import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { requireChildAuth, requireParentAuth } from "../middleware/auth";
import { broadcastToFamily } from "../socket";
import { recordFeed } from "./feed";

export const tasksRouter = Router();

const REPEATS = ["none", "weekly", "monthly"] as const;
const DAY_MS = 24 * 3600 * 1000;
// Base64 de ~450 KB de imagen. El teléfono la reduce antes de mandarla; esto es el techo.
const MAX_PHOTO_CHARS = 600_000;

// Acepta solo JPEG o PNG reales (por los primeros bytes), no cualquier texto con aspecto de base64.
function isValidPhoto(b64: string): boolean {
  if (b64.length < 100 || b64.length > MAX_PHOTO_CHARS) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return false;
  const head = Buffer.from(b64.slice(0, 16), "base64");
  const jpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const png = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  return jpeg || png;
}

type TaskRow = Awaited<ReturnType<typeof db.task.findFirstOrThrow>>;
// Nunca se devuelve la foto en las listas: se pide aparte.
const serialize = (t: TaskRow) => ({
  id: t.id,
  childDeviceId: t.childDeviceId,
  title: t.title,
  reward: t.reward,
  requiresPhoto: t.requiresPhoto,
  repeat: t.repeat,
  dueDate: t.dueDate,
  status: t.status,
  hasPhoto: t.hasPhoto,
  doneAt: t.doneAt,
  confirmedAt: t.confirmedAt,
  createdAt: t.createdAt,
});
const listSelect = {
  id: true, parentId: true, childDeviceId: true, title: true, reward: true, requiresPhoto: true, repeat: true,
  dueDate: true, status: true, hasPhoto: true, doneAt: true, confirmedAt: true, createdAt: true,
} as const;

// ---- Padre -----------------------------------------------------------------------------

const createSchema = z.object({
  childDeviceId: z.string().min(1),
  title: z.string().trim().min(1).max(80),
  reward: z.string().trim().max(80).optional().default(""),
  requiresPhoto: z.boolean().optional().default(false),
  repeat: z.enum(REPEATS).optional().default("none"),
  dueDate: z.string().datetime().optional(),
});

tasksRouter.post("/", requireParentAuth, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
  const d = parsed.data;
  const child = await db.childDevice.findFirst({ where: { id: d.childDeviceId, parentId: req.parentId! } });
  if (!child) return res.status(404).json({ error: "child_not_found" });

  const task = await db.task.create({
    data: {
      parentId: req.parentId!,
      childDeviceId: child.id,
      title: d.title,
      reward: d.reward,
      requiresPhoto: d.requiresPhoto,
      repeat: d.repeat,
      dueDate: d.dueDate ? new Date(d.dueDate) : new Date(),
    },
  });
  res.status(201).json(serialize(task));
});

tasksRouter.get("/", requireParentAuth, async (req, res) => {
  const childDeviceId = req.query.childDeviceId ? String(req.query.childDeviceId) : undefined;
  const tasks = await db.task.findMany({
    where: { parentId: req.parentId!, ...(childDeviceId ? { childDeviceId } : {}) },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    select: listSelect,
  });
  res.json({ tasks });
});

tasksRouter.get("/:id/photo", requireParentAuth, async (req, res) => {
  const task = await db.task.findFirst({ where: { id: req.params.id, parentId: req.parentId! }, select: { photoBase64: true } });
  if (!task || !task.photoBase64) return res.status(404).json({ error: "no_photo" });
  res.json({ photoBase64: task.photoBase64 });
});

tasksRouter.post("/:id/confirm", requireParentAuth, async (req, res) => {
  const task = await db.task.findFirst({ where: { id: req.params.id, parentId: req.parentId! } });
  if (!task) return res.status(404).json({ error: "not_found" });
  if (task.status !== "waiting") return res.status(409).json({ error: "invalid_state" });

  const confirmed = await db.task.update({ where: { id: task.id }, data: { status: "confirmed", confirmedAt: new Date() } });
  let next: TaskRow | null = null;
  if (task.repeat !== "none") {
    next = await db.task.create({
      data: {
        parentId: task.parentId,
        childDeviceId: task.childDeviceId,
        title: task.title,
        reward: task.reward,
        requiresPhoto: task.requiresPhoto,
        repeat: task.repeat,
        dueDate: new Date(task.dueDate.getTime() + (task.repeat === "weekly" ? 7 : 30) * DAY_MS),
      },
    });
  }
  const child = await db.childDevice.findUnique({ where: { id: task.childDeviceId }, select: { name: true } });
  // El feed no vuelve a mandar push al padre por algo que él mismo acaba de hacer.
  await db.feedEvent.create({
    data: {
      parentId: task.parentId,
      childDeviceId: task.childDeviceId,
      type: "task_confirmed",
      title: `⭐ ${child?.name ?? "Tu hijo/a"} cumplió: ${task.title}`,
      body: task.reward ? `Premio: ${task.reward}` : "",
    },
  });
  res.json({ task: serialize(confirmed), next: next ? serialize(next) : null });
});

tasksRouter.post("/:id/reject", requireParentAuth, async (req, res) => {
  const task = await db.task.findFirst({ where: { id: req.params.id, parentId: req.parentId! } });
  if (!task) return res.status(404).json({ error: "not_found" });
  if (task.status !== "waiting") return res.status(409).json({ error: "invalid_state" });
  // Vuelve a pendiente y la foto se descarta: tiene que mandar otra.
  const reopened = await db.task.update({
    where: { id: task.id },
    data: { status: "open", doneAt: null, hasPhoto: false, photoBase64: null },
  });
  res.json(serialize(reopened));
});

tasksRouter.delete("/:id", requireParentAuth, async (req, res) => {
  const task = await db.task.findFirst({ where: { id: req.params.id, parentId: req.parentId! }, select: { id: true } });
  if (!task) return res.status(404).json({ error: "not_found" });
  await db.task.delete({ where: { id: task.id } });
  res.status(204).end();
});

// ---- Hijo/a ----------------------------------------------------------------------------

tasksRouter.get("/mine", requireChildAuth, async (req, res) => {
  const since = new Date(Date.now() - 7 * DAY_MS);
  const tasks = await db.task.findMany({
    where: {
      childDeviceId: req.childDeviceId!,
      OR: [{ status: { in: ["open", "waiting"] } }, { status: "confirmed", confirmedAt: { gte: since } }],
    },
    orderBy: [{ dueDate: "asc" }],
    take: 100,
    select: listSelect,
  });
  res.json({ tasks });
});

const doneSchema = z.object({ photoBase64: z.string().optional() });

tasksRouter.post("/:id/done", requireChildAuth, async (req, res) => {
  const parsed = doneSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
  const task = await db.task.findFirst({ where: { id: req.params.id, childDeviceId: req.childDeviceId! } });
  if (!task) return res.status(404).json({ error: "not_found" });
  if (task.status !== "open") return res.status(409).json({ error: "invalid_state" });

  const photo = parsed.data.photoBase64;
  if (task.requiresPhoto && !photo) return res.status(400).json({ error: "photo_required" });
  if (photo && !isValidPhoto(photo)) return res.status(400).json({ error: "invalid_photo" });

  const updated = await db.task.update({
    where: { id: task.id },
    data: { status: "waiting", doneAt: new Date(), hasPhoto: !!photo, photoBase64: photo ?? null },
  });
  const child = await db.childDevice.findUnique({ where: { id: task.childDeviceId }, select: { name: true } });
  await recordFeed(
    task.parentId,
    task.childDeviceId,
    "task_done",
    `✅ ${child?.name ?? "Tu hijo/a"} terminó: ${task.title}`,
    photo ? "Mandó una foto. Falta tu aprobación." : "Falta tu aprobación.",
  );
  broadcastToFamily(task.parentId, "task:update", { id: task.id });
  res.json(serialize(updated));
});
