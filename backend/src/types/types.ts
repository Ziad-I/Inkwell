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

export const DrawPermissions = ["owner", "anyone"] as const;
export type DrawPermission = (typeof DrawPermissions)[number];

export interface SocketData {
  userId: string;
  roomId?: string;
  meta: PresenceMeta;
  canDraw?: boolean;
}
