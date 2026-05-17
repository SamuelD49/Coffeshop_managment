import { randomBytes } from "crypto";
import type { Request, Response, NextFunction } from "express";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function ensureToken(req: Request): string {
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomBytes(32).toString("hex");
  }
  return req.session.csrfToken;
}

function checkToken(req: Request): boolean {
  const submitted = (req.body && req.body._csrf) || req.header("x-csrf-token");
  return !!submitted && submitted === req.session.csrfToken;
}

export function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  ensureToken(req);
  res.locals.csrfToken = req.session.csrfToken;
  if (SAFE.has(req.method)) return next();

  // multipart/form-data is parsed by multer at the route level, AFTER all
  // global middleware runs. req.body is empty here for those requests, so
  // we can't validate the token at this layer. Upload routes opt in to a
  // separate `csrfMultipart` middleware after their multer step.
  const ct = (req.headers["content-type"] || "").toLowerCase();
  if (ct.startsWith("multipart/form-data")) return next();

  if (!checkToken(req)) {
    return res.status(403).render("errors/403", { message: "Invalid CSRF token" });
  }
  next();
}

// Apply after multer on upload routes. Same token check, but runs once the
// multipart body has been parsed into req.body.
export function csrfMultipart(req: Request, res: Response, next: NextFunction) {
  if (SAFE.has(req.method)) return next();
  if (!checkToken(req)) {
    return res.status(403).render("errors/403", { message: "Invalid CSRF token" });
  }
  next();
}
