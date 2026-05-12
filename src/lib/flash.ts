import type { Request, Response, NextFunction } from "express";

export type FlashType = "success" | "error" | "info";

export function pushFlash(req: Request, type: FlashType, text: string) {
  if (!req.session.flash) req.session.flash = [];
  req.session.flash.push({ type, text });
}

export function flashMiddleware(req: Request, res: Response, next: NextFunction) {
  res.locals.flash = req.session.flash ?? [];
  req.session.flash = [];
  next();
}
