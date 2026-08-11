import { eq } from "drizzle-orm";
import { db } from "@/db/index.js";
import { users, type User } from "@/db/schema.js";
import { hashPassword } from "@/services/auth.js";

export function toPublicUser(user: User) {
  return { id: user.id, username: user.username, email: user.email };
}

export async function getUserById(userId: string): Promise<User | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return rows[0] ?? null;
}

export async function getUserByUsername(
  username: string,
): Promise<User | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  return rows[0] ?? null;
}

export async function createUser(input: {
  username: string;
  email: string;
  password: string;
}): Promise<User> {
  const passwordHash = await hashPassword(input.password);
  const rows = await db
    .insert(users)
    .values({
      username: input.username,
      email: input.email,
      passwordHash,
    })
    .returning();
  return rows[0]!;
}

export async function updateUser(
  userId: string,
  input: Partial<{
    username: string;
    email: string;
  }>,
): Promise<User | null> {
  const rows = await db
    .update(users)
    .set(input)
    .where(eq(users.id, userId))
    .returning();
  return rows[0] ?? null;
}
