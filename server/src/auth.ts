import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { getUserById } from "./database.js";

const SECRET = process.env.JWT_SECRET ?? "flourish-dev-secret-change-in-prod";

export function signToken(userId: number): string {
  return jwt.sign({ sub: userId }, SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): { sub: number } | null {
  try {
    const payload = jwt.verify(token, SECRET) as unknown as { sub: number };
    return payload;
  } catch {
    return null;
  }
}

export interface AuthRequest extends Request {
  userId?: number;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const payload = verifyToken(header.slice(7));
  if (!payload || !getUserById(payload.sub)) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }
  req.userId = payload.sub;
  next();
}
