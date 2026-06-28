import { vi } from "vitest";

vi.mock("@/config/logger.js", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    silly: vi.fn(),
    http: vi.fn(),
  },
}));
