import { describe, it, expect, vi } from "vitest";
import { mockDb } from "../../mocks/db.js";

async function loadUsersService() {
  vi.restoreAllMocks();
  return import("@/services/users.js");
}

const USER_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("user queries and creation", () => {
  it("returns the user when found", async () => {
    const { getUserById } = await loadUsersService();
    mockDb.limit.mockReturnValue([
      { id: USER_ID, username: "alice", email: "a@b.c", passwordHash: "h" },
    ]);
    const user = await getUserById(USER_ID);
    expect(user?.username).toBe("alice");
  });

  it("returns null when the user is not found", async () => {
    const { getUserById, getUserByEmail, getUserByUsername } =
      await loadUsersService();
    mockDb.limit.mockReturnValue([]);
    expect(await getUserById("nope")).toBeNull();
    expect(await getUserByEmail("nope@x.com")).toBeNull();
    expect(await getUserByUsername("nope")).toBeNull();
  });

  it("creates a user with a hashed password", async () => {
    const { createUser, toPublicUser } = await loadUsersService();
    mockDb.returning.mockResolvedValue([
      {
        id: USER_ID,
        username: "alice",
        email: "a@b.c",
        passwordHash: "hashed",
        createdAt: new Date(),
      },
    ]);

    const user = await createUser({
      username: "alice",
      email: "a@b.c",
      password: "supersecret",
    });

    expect(user.passwordHash).toBe("hashed");
    const values = mockDb.values.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;
    expect(values.passwordHash).not.toBe("supersecret");
    expect(String(values.passwordHash).startsWith("$2")).toBe(true);
  });

  it("shapes a public user without the password hash", async () => {
    const { toPublicUser } = await loadUsersService();
    const user = {
      id: USER_ID,
      username: "alice",
      email: "a@b.c",
      passwordHash: "hashed",
      createdAt: new Date(),
    };
    expect(toPublicUser(user)).toEqual({
      id: USER_ID,
      username: "alice",
      email: "a@b.c",
    });
  });

  it("updates a user and returns the row; null when user is gone", async () => {
    const { updateUser } = await loadUsersService();
    mockDb.returning.mockResolvedValueOnce([
      { id: USER_ID, username: "new", email: "a@b.c", passwordHash: "h" },
    ]);
    const updated = await updateUser(USER_ID, { username: "new" });
    expect(updated?.username).toBe("new");
    expect(mockDb.set).toHaveBeenCalledWith({ username: "new" });

    mockDb.returning.mockResolvedValueOnce([]);
    expect(await updateUser("gone", { username: "x" })).toBeNull();
  });
});