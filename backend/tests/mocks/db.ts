import { vi } from "vitest";

export const mockDb = {
  execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([]),
};

vi.mock("@/db/index.js", () => ({
  db: mockDb,
  connectDB: vi.fn().mockResolvedValue(undefined),
  disconnectDB: vi.fn().mockResolvedValue(undefined),
}));
