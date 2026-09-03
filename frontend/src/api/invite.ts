import { apiClient, parseResponse } from "@/api/client";
import {
  inviteCreateResponseSchema,
  inviteInfoResponseSchema,
  inviteRedeemResponseSchema,
} from "@/api/schemas";
import type { InviteInfo } from "@/types/invite";

export interface InviteRequestOptions {
  signal?: AbortSignal;
  allowAuthRefresh?: boolean;
}

export interface CreateInviteInput {
  role: "editor" | "viewer";
  expiresAt?: string;
}

export async function getInvite(
  token: string,
  options?: InviteRequestOptions,
): Promise<InviteInfo> {
  return parseResponse(
    apiClient.get(`/invites/${encodeURIComponent(token)}`, {
      metadata: {
        allowAuthRefresh: options?.allowAuthRefresh ?? true,
      },
      signal: options?.signal,
    }),
    inviteInfoResponseSchema,
  );
}

export async function redeemInvite(
  token: string,
  options?: InviteRequestOptions,
): Promise<{ boardId: string }> {
  return parseResponse(
    apiClient.post(
      "/invites/redeem",
      { token },
      {
        metadata: {
          allowAuthRefresh: options?.allowAuthRefresh ?? false,
        },
        signal: options?.signal,
      },
    ),
    inviteRedeemResponseSchema,
  );
}

export async function createInvite(
  boardId: string,
  input: CreateInviteInput,
  options?: InviteRequestOptions,
): Promise<{ token: string }> {
  return parseResponse(
    apiClient.post(`/boards/${boardId}/invites`, input, {
      metadata: {
        allowAuthRefresh: options?.allowAuthRefresh ?? false,
      },
      signal: options?.signal,
    }),
    inviteCreateResponseSchema,
  );
}

export const invitesApi = {
  get: getInvite,
  redeem: redeemInvite,
  create: createInvite,
};

export default invitesApi;
