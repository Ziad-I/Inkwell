import type { Command, CommandID, PresenceMeta } from "@/types/command";
import type { Point } from "./common";

export type BoardRole = "owner" | "editor" | "viewer";
export type BoardPermissions = { read: boolean; draw: boolean };

type Ack<T = void> = (err?: unknown, resp?: T) => void;
type AckWithSeq = Ack<{ seq: number }>;
type AckJoin = Ack<{ role: BoardRole; permissions: BoardPermissions }>;

export type ClientEmitEvents = {
  "room:join": (
    payload: { roomId: string; lastSeq: number },
    ack?: AckJoin,
  ) => void;
  "command:create": (
    payload: { id: CommandID; command: Command },
    ack?: Ack,
  ) => void;
  "command:update": (
    payload: { id: CommandID; command: Command },
    ack?: Ack,
  ) => void;
  "command:finalize": (
    payload: { id: CommandID; command: Command },
    ack?: AckWithSeq,
  ) => void;
  "command:cancel": (payload: { id: CommandID }, ack?: Ack) => void;
  "command:undo": (payload: { id: CommandID }, ack?: AckWithSeq) => void;
  "command:redo": (payload: { id: CommandID }, ack?: AckWithSeq) => void;
  "presence:move": (payload: { pos: Point }, ack?: Ack) => void;
};

// Events the client listens for from the server
export type ClientListenEvents = {
  "command:create": (commandId: CommandID, command: Command) => void;
  "command:update": (commandId: CommandID, command: Command) => void;
  "command:finalize": (commandId: CommandID, command: Command) => void;
  "command:cancel": (commandId: CommandID) => void;
  "command:undo": (commandId: CommandID, command: Command) => void;
  "command:redo": (commandId: CommandID, command: Command) => void;
  "command:reject": (commandId: CommandID, reason: string) => void;
  "room:sync": (state: Command[]) => void;
  "presence:join": (userId: string, meta: PresenceMeta) => void;
  "presence:leave": (userId: string) => void;
  "presence:move": (userId: string, pos: Point) => void;
};
