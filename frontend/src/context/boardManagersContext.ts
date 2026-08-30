import { createContext, useContext } from "react";
import type { ToolManager } from "@/core/toolManager";
import type { CommandManager } from "@/core/commandManager";
import type { BoardSession } from "@/collaboration/boardSession";
import type { Point } from "@/types/command";

export type BoardManagersContextValue = {
  /** Epoch id of the session that owns the current manager refs. */
  epoch: string;
  toolManagerRef: React.RefObject<ToolManager | null>;
  commandManagerRef: React.RefObject<CommandManager | null>;
  coordinatorRef: React.RefObject<BoardSession | null>;
  /**
   * Volatile presence emission routed through the session coordinator;
   * returns false while no coordinator is active or the session is not
   * ready. Presentation must not touch the transport directly.
   */
  emitPresence: (pos: Point) => boolean;
};

export const BoardManagersContext =
  createContext<BoardManagersContextValue | null>(null);

export function useBoardManagers() {
  const ctx = useContext(BoardManagersContext);
  if (!ctx) {
    throw new Error(
      "useBoardManagers must be used within BoardManagersProvider",
    );
  }
  return ctx;
}
