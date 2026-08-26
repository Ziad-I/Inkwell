import type { Board } from "@/db/schema.js";
import { validateInviteToken } from "@/services/invites.js";
import type {
  BoardAccess,
  BoardPermission,
  BoardRole,
  Principal,
} from "@/types/types.js";

const ROLE_PERMISSIONS: Record<BoardRole, Record<BoardPermission, boolean>> = {
  owner: { read: true, draw: true },
  editor: { read: true, draw: true },
  viewer: { read: true, draw: false },
};

export function getPermissionsForRole(
  role: BoardRole,
): Record<BoardPermission, boolean> {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(
  access: BoardAccess | undefined,
  permission: BoardPermission,
): boolean {
  return access !== undefined && access.permissions[permission] === true;
}

function resolveFallbackRole(board: Board | null): BoardRole {
  if (!board) return "editor";
  return board.defaultRole;
}

export async function authorizeBoardAccess(input: {
  boardId: string;
  board: Board | null;
  principal: Principal;
  inviteToken?: string | null;
}): Promise<BoardAccess> {
  const { boardId, board, principal, inviteToken } = input;

  let role: BoardRole;

  if (board && principal.type === "user" && principal.id === board.ownerId) {
    role = "owner";
  } else if (inviteToken) {
    const invite = await validateInviteToken(inviteToken);
    role =
      invite && invite.boardId === boardId
        ? invite.role
        : resolveFallbackRole(board);
  } else {
    role = resolveFallbackRole(board);
  }

  return {
    boardId,
    principal,
    role,
    permissions: getPermissionsForRole(role),
  };
}
