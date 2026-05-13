import type { Request, Response } from "express";

// Stub — real implementation lands in Task 14.
export function showLogin(_req: Request, res: Response) {
  res.status(501).send("Not implemented yet");
}

export function submitLogin(_req: Request, res: Response) {
  res.status(501).send("Not implemented yet");
}

export function logout(_req: Request, res: Response) {
  res.status(501).send("Not implemented yet");
}
