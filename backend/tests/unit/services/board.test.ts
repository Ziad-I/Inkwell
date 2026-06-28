import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb } from "../../mocks/db.js";

const mockBoard = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  title: "Test Board",
  ownerId: "user-123",
  drawPermission: "anyone",
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

async function loadBoardService() {
  vi.restoreAllMocks();
  return import("@/services/board.js");
}

describe("getBoardById", () => {
  it("returns board when found", async () => {
    mockDb.limit.mockReturnValue([mockBoard]);
    const { getBoardById } = await loadBoardService();

    const result = await getBoardById("550e8400-e29b-41d4-a716-446655440000");

    expect(result).toEqual(mockBoard);
    expect(mockDb.select).toHaveBeenCalled();
    expect(mockDb.from).toHaveBeenCalled();
    expect(mockDb.where).toHaveBeenCalled();
    expect(mockDb.limit).toHaveBeenCalledWith(1);
  });

  it("returns null when board not found", async () => {
    mockDb.limit.mockReturnValue([]);
    const { getBoardById } = await loadBoardService();

    const result = await getBoardById("nonexistent-id");

    expect(result).toBeNull();
  });
});

describe("createBoard", () => {
  it("creates and returns a board", async () => {
    mockDb.returning.mockResolvedValue([mockBoard]);
    const { createBoard } = await loadBoardService();

    const result = await createBoard("Test Board", "user-123", "anyone");

    expect(result).toEqual(mockBoard);
    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.values).toHaveBeenCalledWith({
      title: "Test Board",
      ownerId: "user-123",
      drawPermission: "anyone",
    });
  });

  it("creates board with owner-only draw permission", async () => {
    const ownerBoard = { ...mockBoard, drawPermission: "owner" };
    mockDb.returning.mockResolvedValue([ownerBoard]);
    const { createBoard } = await loadBoardService();

    const result = await createBoard("Private Board", "user-123", "owner");

    expect(result.drawPermission).toBe("owner");
  });
});

describe("updateBoard", () => {
  it("updates board title", async () => {
    const { updateBoard } = await loadBoardService();

    await updateBoard("board-id", { title: "New Title" });

    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.set).toHaveBeenCalled();
    expect(mockDb.where).toHaveBeenCalled();
  });

  it("skips update when no valid fields provided", async () => {
    const { updateBoard } = await loadBoardService();

    await updateBoard("board-id", {});

    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("updates updatedAt timestamp on change", async () => {
    const { updateBoard } = await loadBoardService();

    await updateBoard("board-id", { title: "Updated" });

    const setCall = mockDb.set.mock.calls[0]?.[0];
    expect(setCall).toHaveProperty("title");
    expect(setCall).toHaveProperty("updatedAt");
    expect(setCall.updatedAt).toBeInstanceOf(Date);
  });
});

describe("deleteBoard", () => {
  it("deletes board by room id", async () => {
    const { deleteBoard } = await loadBoardService();

    await deleteBoard("board-id");

    expect(mockDb.delete).toHaveBeenCalled();
    expect(mockDb.where).toHaveBeenCalled();
  });
});
