import type { Request, Response, NextFunction } from "express";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).render("errors/404");
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error(err);
  res.status(500).render("errors/500", { message: process.env.NODE_ENV === "development" ? err.message : "Server error" });
}
