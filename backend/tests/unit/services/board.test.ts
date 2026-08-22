import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb } from "../../mocks/db.js";
import { de } from "zod/locales";

const mockBoard = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  title: "Test Board",
  ownerId: "user-123",
  defaultRole: "editor",
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

    const result = await createBoard("Test Board", "user-123", "editor");

    expect(result).toEqual(mockBoard);
    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.values).toHaveBeenCalledWith({
      title: "Test Board",
      ownerId: "user-123",
      defaultRole: "editor",
    });
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

describe("listBoardsByOwner", () => {
  it("returns active boards for the owner, newest activity first", async () => {
    const rows = [{ ...mockBoard, id: "b1" }, { ...mockBoard, id: "b2" }];
    mockDb.orderBy.mockResolvedValueOnce(rows);
    const { listBoardsByOwner } = await loadBoardService();

    const result = await listBoardsByOwner("user-123");

    expect(result).toEqual(rows);
    expect(mockDb.where).toHaveBeenCalled();
    expect(mockDb.orderBy).toHaveBeenCalled();
  });

  it("returns archived boards when status is 'archived'", async () => {
    const archived = [{ ...mockBoard, id: "b3", archivedAt: new Date() }];
    mockDb.orderBy.mockResolvedValueOnce(archived);
    const { listBoardsByOwner } = await loadBoardService();

    const result = await listBoardsByOwner("user-123", "archived");

    expect(result).toEqual(archived);
  });
});

describe("duplicateBoard", () => {
  const snapshotRow = {
    id: "snap-1",
    boardId: "board-id",
    state: { elements: [] },
    createdAt: new Date("2025-02-01"),
  };

  it("clones the row and the latest snapshot", async () => {
    const newBoard = { ...mockBoard, id: "copy-id", title: "Test Board (Copy)" };
    mockDb.limit.mockReturnValueOnce([mockBoard]);
    mockDb.limit.mockReturnValueOnce([snapshotRow]);
    mockDb.returning
      .mockResolvedValueOnce([newBoard])
      .mockResolvedValueOnce([{ ...snapshotRow, boardId: "copy-id" }]);

    const beforeInserts = mockDb.insert.mock.calls.length;
    const beforeValues = mockDb.values.mock.calls.length;
    const { duplicateBoard } = await loadBoardService();

    const result = await duplicateBoard("board-id");

    expect(mockDb.insert.mock.calls.length - beforeInserts).toBe(2);
    const valueCalls = mockDb.values.mock.calls.slice(beforeValues);
    expect(valueCalls[0]?.[0]).toMatchObject({
      title: "Test Board (Copy)",
      ownerId: "user-123",
      defaultRole: "editor",
    });
    expect(valueCalls[1]?.[0]).toMatchObject({
      boardId: "copy-id",
      state: snapshotRow.state,
    });
    expect(result).toEqual(newBoard);
  });

  it("does not write a snapshot when the source has none", async () => {
    const newBoard = { ...mockBoard, id: "copy-id", title: "Test Board (Copy)" };
    mockDb.limit.mockReturnValueOnce([mockBoard]);
    mockDb.limit.mockReturnValueOnce([]);
    mockDb.returning.mockResolvedValueOnce([newBoard]);

    const beforeInserts = mockDb.insert.mock.calls.length;
    const { duplicateBoard } = await loadBoardService();

    const result = await duplicateBoard("board-id");

    expect(mockDb.insert.mock.calls.length - beforeInserts).toBe(1);
    expect(result).toEqual(newBoard);
  });

  it("returns null when the source board does not exist", async () => {
    mockDb.limit.mockReturnValueOnce([]);
    const { duplicateBoard } = await loadBoardService();

    const result = await duplicateBoard("missing-id");

    expect(result).toBeNull();
  });
});

describe("archiveBoard", () => {
  it("stamps archivedAt alongside updatedAt", async () => {
    const { archiveBoard } = await loadBoardService();

    await archiveBoard("board-id");

    const setCall = mockDb.set.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;
    expect(setCall.archivedAt).toBeInstanceOf(Date);
    expect(setCall.updatedAt).toBeInstanceOf(Date);
  });
});

describe("restoreBoard", () => {
  it("clears archivedAt", async () => {
    const { restoreBoard } = await loadBoardService();

    await restoreBoard("board-id");

    const setCall = mockDb.set.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;
    expect(setCall.archivedAt).toBeNull();
    expect(setCall.updatedAt).toBeInstanceOf(Date);
  });
});
