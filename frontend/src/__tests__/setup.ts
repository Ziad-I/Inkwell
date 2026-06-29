import "@testing-library/jest-dom/vitest";
import { vi, beforeEach } from "vitest";

import "./mocks/konva";
import "./mocks/socket-io";
import "./mocks/match-media";

vi.mock("react-konva", () => import("./mocks/react-konva"));

beforeEach(() => {
  vi.clearAllMocks();
});
