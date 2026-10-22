import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export interface ParentTokenPayload {
  kind: "parent";
  parentId: string;
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
      childDeviceId?: string;
    }
  }
}

export function signParentToken(parentId: string): string {
  return jwt.sign({ kind: "parent", parentId } as ParentTokenPayload, JWT_SECRET, {
    expiresIn: "30d",
  });
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

export function requireParentAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "missing_token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as ParentTokenPayload;
    if (payload.kind !== "parent") throw new Error("wrong_kind");
    req.parentId = payload.parentId;
    next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
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
