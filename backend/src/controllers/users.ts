import type { Request, Response } from "express";
import { z } from "zod";
import {
  getUserByEmail,
  getUserByUsername,
  getUserById,
  toPublicUser,
  updateUser,
} from "@/services/users.js";

const updateProfileSchema = z
  .object({
    username: z.string().min(1).max(50).optional(),
    email: z.string().email().max(254).optional(),
  })
  .refine((data) => data.username !== undefined || data.email !== undefined, {
    message: "Nothing to update",
  });

export async function me(req: Request, res: Response) {
  const user = req.userId ? await getUserById(req.userId) : null;
  if (!user) {
    res.status(401).json({ message: "User not found" });
    return;
  }
  res.status(200).json({ user: toPublicUser(user) });
}

export async function updateProfile(req: Request, res: Response) {
  const result = updateProfileSchema.safeParse(req.body);
  if (!result.success) {
    res
      .status(400)
      .json({ message: "Invalid input", errors: result.error.flatten() });
    return;
  }
  if (!req.userId) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }
  const { username, email } = result.data;
  const current = await getUserById(req.userId);
  if (!current) {
    res.status(401).json({ message: "User not found" });
    return;
  }

  // Own-value resubmission must not count as a conflict.
  if (email && email !== current.email && (await getUserByEmail(email))) {
    res.status(409).json({ message: "Email is already registered" });
    return;
  }
  if (
    username &&
    username !== current.username &&
    (await getUserByUsername(username))
  ) {
    res.status(409).json({ message: "Username is already taken" });
    return;
  }

  let updated;
  try {
    updated = await updateUser(req.userId, {
      ...(username !== undefined ? { username } : {}),
      ...(email !== undefined ? { email } : {}),
    });
  } catch (err) {
    const wrapped = err as { cause?: unknown };
    const pgError = (wrapped.cause ?? err) as {
      code?: unknown;
      constraint?: unknown;
    };
    if (pgError.code !== "23505") throw err;
    if (pgError.constraint === "user_email_unique") {
      res.status(409).json({ message: "Email is already registered" });
      return;
    }
    if (pgError.constraint === "user_username_unique") {
      res.status(409).json({ message: "Username is already taken" });
      return;
    }
    throw err;
  }
  if (!updated) {
    res.status(401).json({ message: "User not found" });
    return;
  }
  res.status(200).json({ user: toPublicUser(updated) });
}
