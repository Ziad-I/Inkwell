import type { Request, Response } from "express";
import { getUserById, toPublicUser } from "@/services/users.js";

export async function me(req: Request, res: Response) {
  const user = req.userId ? await getUserById(req.userId) : null;
  if (!user) {
    res.status(401).json({ message: "User not found" });
    return;
  }
  res.status(200).json({ user: toPublicUser(user) });
}