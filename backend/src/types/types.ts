export type Ack<T = void> = (err?: unknown, resp?: T) => void;

export type CommandID = string;

export type CommandType =
  | "stroke"
  | "shape"
  | "erase"
  | "transform"
  | "tombstone"
  | "restore";

export type CommandStatus = "pending" | "applied" | "reverted";
export type CommandPayload = Record<string, unknown>;

export interface Command {
  id: CommandID;
  type: CommandType;
  payload: CommandPayload;
  owner: string;
  status: CommandStatus;
  timestamp: number;
  seq?: number;
}

export type BoardState = Record<CommandID, Command>;

export interface PresenceMeta {
  userName: string;
  userColor: string;
}

export interface Point {
  x: number;
  y: number;
}

export const BoardRoles = ["owner", "editor", "viewer"] as const;
export type BoardRole = (typeof BoardRoles)[number];

export const BoardPermissions = ["read", "draw"] as const;
export type BoardPermission = (typeof BoardPermissions)[number];

export type PrincipalType = "user" | "guest";

export interface Principal {
  type: PrincipalType;
  id: string;
}

export interface BoardAccess {
  boardId: string;
  principal: Principal;
  role: BoardRole;
  permissions: Record<BoardPermission, boolean>;
}

export interface SocketData {
  userId: string;
  roomId?: string;
  meta: PresenceMeta;
  principalType: PrincipalType;
  boardAccess?: BoardAccess;
}
