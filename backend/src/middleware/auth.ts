import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "../db";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export interface ParentTokenPayload {
  kind: "parent";
  /** Id de la familia (el de la cuenta principal). Todo el sistema filtra por este id. */
  parentId: string;
  /** Presente solo si quien ingresó es un adulto invitado (la madre, por ejemplo) y no la cuenta principal. */
  adultId?: string;
}

export interface ChildTokenPayload {
  kind: "child";
  childDeviceId: string;
  parentId: string;
}

declare global {
  namespace Express {
    interface Request {
      parentId?: string;
      adultId?: string;
      childDeviceId?: string;
    }
  }
}

export function signParentToken(parentId: string, adultId?: string): string {
  const payload: ParentTokenPayload = adultId ? { kind: "parent", parentId, adultId } : { kind: "parent", parentId };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "90d" });
}

export function signChildDeviceToken(childDeviceId: string, parentId: string): string {
  // Token de larga duración: la app del chico lo guarda localmente y lo reusa en cada request.
  return jwt.sign(
    { kind: "child", childDeviceId, parentId } as ChildTokenPayload,
    JWT_SECRET,
    { expiresIn: "3650d" }
  );
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

/** Un adulto invitado sigue valiendo solo mientras el dueño no lo haya quitado de la familia. */
export async function adultStillInFamily(payload: ParentTokenPayload): Promise<boolean> {
  if (!payload.adultId) return true;
  const adult = await db.adult.findUnique({ where: { id: payload.adultId }, select: { parentId: true } });
  return !!adult && adult.parentId === payload.parentId;
}

export async function requireParentAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "missing_token" });
  let payload: ParentTokenPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as ParentTokenPayload;
    if (payload.kind !== "parent") throw new Error("wrong_kind");
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
  try {
    if (!(await adultStillInFamily(payload))) return res.status(401).json({ error: "invalid_token" });
  } catch {
    return res.status(503).json({ error: "try_again" }); // la base no respondió: no es lo mismo que "sesión inválida"
  }
  req.parentId = payload.parentId;
  req.adultId = payload.adultId;
  next();
}

export function requireChildAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "missing_token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as ChildTokenPayload;
    if (payload.kind !== "child") throw new Error("wrong_kind");
    req.childDeviceId = payload.childDeviceId;
    req.parentId = payload.parentId;
    next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}

export function verifySocketToken(token: string): ParentTokenPayload | ChildTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as ParentTokenPayload | ChildTokenPayload;
  } catch {
    return null;
  }
}
