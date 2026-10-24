import { Router } from "express";
import { db } from "../db";
import { requireParentAuth } from "../middleware/auth";

export const childrenRouter = Router();

// Borra un perfil de hijo/a (ej. uno de prueba) junto con todo lo que tenga
// asociado: ubicaciones, alertas SOS, zonas propias, uso de apps, etc. — el
// borrado en cascada está en la base, así que acá solo hace falta validar
// que el hijo sea de este padre y borrarlo.
childrenRouter.delete("/:id", requireParentAuth, async (req, res) => {
  const child = await db.childDevice.findFirst({ where: { id: req.params.id, parentId: req.parentId! } });
  if (!child) return res.status(404).json({ error: "not_found" });

  await db.childDevice.delete({ where: { id: child.id } });
  res.status(204).end();
});
