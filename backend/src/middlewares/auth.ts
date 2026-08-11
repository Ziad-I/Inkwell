import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "@/services/auth.js";
import { AuthError } from "@/types/errors.js";

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }
  try {
    req.userId = verifyAccessToken(token);
    next();
  } catch (err) {
    const statusCode = err instanceof AuthError ? err.statusCode : 401;
    res.status(statusCode).json({ message: "Invalid or expired token" });
  }
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) {
    next();
    return;
  }
  try {
    req.userId = verifyAccessToken(token);
  } catch {
    // Invalid tokens are ignored by optional auth: treat the request as anonymous.
  }
  next();
}
