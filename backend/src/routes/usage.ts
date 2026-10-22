import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { requireChildAuth, requireParentAuth } from "../middleware/auth";

export const usageRouter = Router();

const reportSchema = z.object({
  date: z.string(), // "YYYY-MM-DD"
  apps: z.array(
    z.object({
      packageName: z.string(),
      appName: z.string(),
      usageMinutes: z.number().int().min(0),
    })
  ),
});

// La app del hijo sube, una vez por día (o al reconectar), el acumulado de
// uso por app que calculó con UsageStatsManager. upsert para que un reenvío
// del mismo día no duplique filas.
usageRouter.post("/report", requireChildAuth, async (req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
  const date = new Date(`${parsed.data.date}T00:00:00.000Z`);

  await Promise.all(
    parsed.data.apps.map((app) =>
      db.appUsageRecord.upsert({
        where: { childDeviceId_packageName_date: { childDeviceId: req.childDeviceId!, packageName: app.packageName, date } },
        update: { usageMinutes: app.usageMinutes, appName: app.appName },
        create: { childDeviceId: req.childDeviceId!, date, ...app },
      })
    )
  );
  res.status(201).json({ ok: true });
});

usageRouter.get("/:childDeviceId/summary", requireParentAuth, async (req, res) => {
  const { childDeviceId } = req.params;
  const child = await db.childDevice.findFirst({ where: { id: childDeviceId, parentId: req.parentId! } });
  if (!child) return res.status(404).json({ error: "not_found" });

  const date = req.query.date ? new Date(`${req.query.date}T00:00:00.000Z`) : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const records = await db.appUsageRecord.findMany({
    where: { childDeviceId, date },
    orderBy: { usageMinutes: "desc" },
  });
  res.json({ date, apps: records });
});

// --- Límites / bloqueo de apps ----------------------------------------------

const blockSchema = z.object({
  packageName: z.string(),
  dailyLimitMin: z.number().int().min(0).nullable(), // null = bloqueada por completo
});

usageRouter.post("/:childDeviceId/blocked-apps", requireParentAuth, async (req, res) => {
  const { childDeviceId } = req.params;
  const child = await db.childDevice.findFirst({ where: { id: childDeviceId, parentId: req.parentId! } });
  if (!child) return res.status(404).json({ error: "not_found" });

  const parsed = blockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_input" });

  const entry = await db.blockedApp.upsert({
    where: { childDeviceId_packageName: { childDeviceId, packageName: parsed.data.packageName } },
    update: { dailyLimitMin: parsed.data.dailyLimitMin },
    create: { childDeviceId, ...parsed.data },
  });
  res.status(201).json({ blockedApp: entry });
});

// La app del hijo consulta esto periódicamente para saber qué debe bloquear
// localmente (vía AccessibilityService). El bloqueo real se aplica en el
// dispositivo, el servidor solo guarda la configuración.
usageRouter.get("/:childDeviceId/blocked-apps", requireChildAuth, async (req, res) => {
  const rules = await db.blockedApp.findMany({ where: { childDeviceId: req.childDeviceId! } });
  res.json({ rules });
});
