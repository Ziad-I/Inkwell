import { vi } from "vitest";

export const mockSocket = {
  on: vi.fn().mockReturnThis(),
  off: vi.fn().mockReturnThis(),
  emit: vi.fn(),
  connect: vi.fn().mockReturnThis(),
  disconnect: vi.fn().mockReturnThis(),
  close: vi.fn().mockReturnThis(),
  id: "mock-socket-id",
  connected: true,
  io: { on: vi.fn() },
};

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => mockSocket),
  Socket: vi.fn(),
}));
