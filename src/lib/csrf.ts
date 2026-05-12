import { randomBytes } from "crypto";
import type { Request, Response, NextFunction } from "express";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function ensureToken(req: Request): string {
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomBytes(32).toString("hex");
  }
  return req.session.csrfToken;
}

export function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  ensureToken(req);
  res.locals.csrfToken = req.session.csrfToken;
  if (SAFE.has(req.method)) return next();

  const submitted = (req.body && req.body._csrf) || req.header("x-csrf-token");
  if (!submitted || submitted !== req.session.csrfToken) {
    return res.status(403).render("errors/403", { message: "Invalid CSRF token" });
  }
  next();
}
