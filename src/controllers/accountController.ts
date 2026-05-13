import type { Request, Response } from "express";

// Stub — real implementation lands in Task 17.
export function show(_req: Request, res: Response) {
  res.status(501).send("Not implemented yet");
}

export function changePassword(_req: Request, res: Response) {
  res.status(501).send("Not implemented yet");
}
