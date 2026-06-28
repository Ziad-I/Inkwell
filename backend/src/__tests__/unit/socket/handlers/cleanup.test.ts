import { describe, it, expect, vi, beforeEach } from "vitest";

const snapshotMock = vi.hoisted(() => ({ writeBoardSnapshot: vi.fn() }));
const stateMock = vi.hoisted(() => ({ clearBoardState: vi.fn() }));

vi.mock("@/services/snapshot.js", () => snapshotMock);
vi.mock("@/services/state.js", () => stateMock);

describe("registerRoomCleanup", () => {
  beforeEach(() => {
    snapshotMock.writeBoardSnapshot.mockResolvedValue(undefined);
    stateMock.clearBoardState.mockResolvedValue(undefined);
  });

  it("registers delete-room handler on adapter", async () => {
    const adapter = { on: vi.fn() };
    const io = { of: vi.fn(() => ({ adapter })) };

    const { registerRoomCleanup } = await import("@/socket/handlers/cleanup.js");
    registerRoomCleanup(io as never);

    expect(adapter.on).toHaveBeenCalledWith("delete-room", expect.any(Function));
  });

  it("calls snapshot and clear for valid UUID room IDs", async () => {
    const adapter = { on: vi.fn() };
    const io = { of: vi.fn(() => ({ adapter })) };

    const { registerRoomCleanup } = await import("@/socket/handlers/cleanup.js");
    registerRoomCleanup(io as never);

    const handler = adapter.on.mock.calls[0]?.[1];
    await handler("550e8400-e29b-41d4-a716-446655440000");

    expect(snapshotMock.writeBoardSnapshot).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440000");
    expect(stateMock.clearBoardState).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440000");
  });

  it("ignores non-UUID room IDs", async () => {
    const adapter = { on: vi.fn() };
    const io = { of: vi.fn(() => ({ adapter })) };

    const { registerRoomCleanup } = await import("@/socket/handlers/cleanup.js");
    registerRoomCleanup(io as never);

    const handler = adapter.on.mock.calls[0]?.[1];
    await handler("not-a-uuid");

    expect(snapshotMock.writeBoardSnapshot).not.toHaveBeenCalled();
    expect(stateMock.clearBoardState).not.toHaveBeenCalled();
  });
});
