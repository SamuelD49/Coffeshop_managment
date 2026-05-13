import type { Request, Response } from "express";

export function show(_req: Request, res: Response) {
  res.render("dashboard");
}
