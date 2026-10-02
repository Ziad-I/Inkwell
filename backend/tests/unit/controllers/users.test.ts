import { describe, expect, it, vi, beforeEach } from "vitest";

const USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const current = {
  id: USER_ID,
  username: "alice",
  email: "alice@test.local",
  passwordHash: "hash",
  createdAt: new Date(),
};

const usersMock = vi.hoisted(() => ({
  getUserById: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserByUsername: vi.fn(),
  updateUser: vi.fn(),
  toPublicUser: vi.fn((user) => user),
}));
vi.mock("@/services/users.js", () => usersMock);

function response() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe("updateProfile unique conflicts", () => {
  beforeEach(() => {
    usersMock.getUserById.mockResolvedValue(current);
    usersMock.getUserByEmail.mockResolvedValue(null);
    usersMock.getUserByUsername.mockResolvedValue(null);
  });

  it.each([
    ["user_email_unique", { email: "shared@test.local" }, "Email is already registered"],
    ["user_username_unique", { username: "shared" }, "Username is already taken"],
  ])("maps PostgreSQL constraint %s to 409", async (constraint, body, message) => {
    usersMock.updateUser.mockRejectedValue(
      Object.assign(new Error("query failed"), {
        cause: Object.assign(new Error("duplicate"), { code: "23505", constraint }),
      }),
    );
    const { updateProfile } = await import("@/controllers/users.js");
    const res = response();
    await updateProfile({ userId: USER_ID, body } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ message });
  });

  it("bubbles unrelated update failures", async () => {
    const failure = Object.assign(new Error("connection lost"), { code: "08006" });
    usersMock.updateUser.mockRejectedValue(failure);
    const { updateProfile } = await import("@/controllers/users.js");
    await expect(updateProfile({ userId: USER_ID, body: { username: "new" } } as never, response() as never)).rejects.toBe(failure);
  });
});
