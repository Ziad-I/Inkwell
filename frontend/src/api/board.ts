import { apiClient, parseResponse } from "@/api/client";
import {
  boardListResponseSchema,
  boardReferenceResponseSchema,
} from "@/api/schemas";
import type { BoardListStatus, BoardSummary } from "@/types/boards";

export interface CreateBoardInput {
  name: string;
  drawPermission?: "anyone" | "owner";
}

export interface ListBoardsOptions {
  status: BoardListStatus;
  signal?: AbortSignal;
}

export interface BoardRequestOptions {
  signal?: AbortSignal;
  allowAuthRefresh?: boolean;
}

export async function createBoard(
  input: CreateBoardInput,
  options?: BoardRequestOptions,
): Promise<{ id: string }> {
  return parseResponse(
    apiClient.post("/boards", input, {
      metadata: {
        allowAuthRefresh: options?.allowAuthRefresh ?? false,
      },
      signal: options?.signal,
    }),
    boardReferenceResponseSchema,
  );
}

export async function getBoardReference(
  boardId: string,
  options?: BoardRequestOptions,
): Promise<{ id: string }> {
  return parseResponse(
    apiClient.get(`/boards/${boardId}`, {
      metadata: {
        allowAuthRefresh: options?.allowAuthRefresh ?? true,
      },
      signal: options?.signal,
    }),
    boardReferenceResponseSchema,
  );
}

export async function listBoards(
  options: ListBoardsOptions,
): Promise<{ boards: BoardSummary[] }> {
  return parseResponse(
    apiClient.get("/boards", {
      params: {
        status: options.status,
      },
      metadata: {
        allowAuthRefresh: true,
      },
      signal: options.signal,
    }),
    boardListResponseSchema,
  );
}

export async function renameBoard(
  boardId: string,
  title: string,
  options?: BoardRequestOptions,
): Promise<void> {
  await apiClient.patch(
    `/boards/${boardId}`,
    { title },
    {
      metadata: {
        allowAuthRefresh: options?.allowAuthRefresh ?? false,
      },
      signal: options?.signal,
    },
  );
}

export async function duplicateBoard(
  boardId: string,
  options?: BoardRequestOptions,
): Promise<{ id: string }> {
  return parseResponse(
    apiClient.post(`/boards/${boardId}/duplicate`, undefined, {
      metadata: {
        allowAuthRefresh: options?.allowAuthRefresh ?? false,
      },
      signal: options?.signal,
    }),
    boardReferenceResponseSchema,
  );
}

export async function archiveBoard(
  boardId: string,
  options?: BoardRequestOptions,
): Promise<void> {
  await apiClient.patch(`/boards/${boardId}/archive`, undefined, {
    metadata: {
      allowAuthRefresh: options?.allowAuthRefresh ?? false,
    },
    signal: options?.signal,
  });
}

export async function restoreBoard(
  boardId: string,
  options?: BoardRequestOptions,
): Promise<void> {
  await apiClient.patch(`/boards/${boardId}/restore`, undefined, {
    metadata: {
      allowAuthRefresh: options?.allowAuthRefresh ?? false,
    },
    signal: options?.signal,
  });
}

export async function deleteBoard(
  boardId: string,
  options?: BoardRequestOptions,
): Promise<void> {
  await apiClient.delete(`/boards/${boardId}`, {
    metadata: {
      allowAuthRefresh: options?.allowAuthRefresh ?? false,
    },
    signal: options?.signal,
  });
}

export const boardsApi = {
  create: createBoard,
  get: getBoardReference,
  list: listBoards,
  rename: renameBoard,
  duplicate: duplicateBoard,
  archive: archiveBoard,
  restore: restoreBoard,
  delete: deleteBoard,
};

export default boardsApi;
