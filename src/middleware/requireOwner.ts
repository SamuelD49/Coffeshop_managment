import type { Request, Response, NextFunction } from "express";

export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (req.session.role !== "owner") {
    return res.status(403).render("errors/403", { message: "Owner access required" });
  }
  next();
}
