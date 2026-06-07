import type { Command, CommandID, PresenceMeta } from "@/types/command";
import type { Point } from "./common";

type Ack<T = void> = (err?: any, resp?: T) => void;

export type ClientEmitEvents = {
  "room:join": (payload: { roomId: string }, ack?: Ack) => void;
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
    ack?: Ack,
  ) => void;
  "command:cancel": (payload: { id: CommandID }, ack?: Ack) => void;
  "command:undo": (payload: { id: CommandID }, ack?: Ack) => void;
  "command:redo": (payload: { id: CommandID }, ack?: Ack) => void;
  "presence:move": (payload: { userId: string; pos: Point }, ack?: Ack) => void;
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
