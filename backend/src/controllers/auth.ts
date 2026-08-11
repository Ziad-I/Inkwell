import type { Request, Response } from "express";
import { z } from "zod";
import {
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
  storeRefreshToken,
  verifyPassword,
  generateRefreshToken,
} from "@/services/auth.js";
import {
  createUser,
  getUserByEmail,
  getUserById,
  getUserByUsername,
  toPublicUser,
} from "@/services/users.js";
import { env } from "@/config/config.js";
import { AuthError } from "@/types/errors.js";

const REFRESH_COOKIE = "inkwell_refresh";

const registerSchema = z.object({
  username: z.string().min(1).max(50),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: env.REFRESH_TOKEN_TTL * 1000,
    path: "/api/auth",
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, {
    path: "/api/auth",
  });
}

export async function register(req: Request, res: Response) {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    res
      .status(400)
      .json({ message: "Invalid input", errors: result.error.flatten() });
    return;
  }
  const { username, email, password } = result.data;

  if (await getUserByEmail(email)) {
    res.status(409).json({ message: "Email is already registered" });
    return;
  }
  if (await getUserByUsername(username)) {
    res.status(409).json({ message: "Username is already taken" });
    return;
  }

  try {
    const user = await createUser({ username, email, password });
    const accessToken = signAccessToken(user.id);
    const refreshToken = generateRefreshToken();
    await storeRefreshToken(user.id, refreshToken);
    setRefreshCookie(res, refreshToken);
    res.status(201).json({ user: toPublicUser(user), accessToken });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.statusCode).json({ message: err.message });
      return;
    }
    throw err;
  }
}

export async function login(req: Request, res: Response) {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res
      .status(400)
      .json({ message: "Invalid input", errors: result.error.flatten() });
    return;
  }
  const { email, password } = result.data;
  const user = await getUserByEmail(email);
  const passwordOk = user
    ? await verifyPassword(password, user.passwordHash)
    : false;
  if (!user || !passwordOk) {
    res.status(401).json({ message: "Invalid email or password" });
    return;
  }
  const accessToken = signAccessToken(user.id);
  const refreshToken = generateRefreshToken();
  await storeRefreshToken(user.id, refreshToken);
  setRefreshCookie(res, refreshToken);
  res.status(200).json({ user: toPublicUser(user), accessToken });
}

export async function refresh(req: Request, res: Response) {
  const oldToken = (req.cookies as Record<string, string> | undefined)?.[
    REFRESH_COOKIE
  ];
  if (!oldToken) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }
  try {
    const { userId, newToken } = await rotateRefreshToken(oldToken);
    const user = await getUserById(userId);
    if (!user) {
      res.status(401).json({ message: "Invalid refresh token" });
      return;
    }
    const accessToken = signAccessToken(user.id);
    setRefreshCookie(res, newToken);
    res.status(200).json({ user: toPublicUser(user), accessToken });
  } catch (err) {
    if (err instanceof AuthError) {
      clearRefreshCookie(res);
      res.status(err.statusCode).json({ message: err.message });
      return;
    }
    throw err;
  }
}

export async function logout(req: Request, res: Response) {
  const oldToken = (req.cookies as Record<string, string> | undefined)?.[
    REFRESH_COOKIE
  ];
  if (oldToken) {
    await revokeRefreshToken(oldToken);
  }
  clearRefreshCookie(res);
  res.status(204).send();
}
