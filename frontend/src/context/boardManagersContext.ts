import { createContext, useContext } from "react";
import type { ToolManager } from "@/core/toolManager";
import type { CommandManager } from "@/core/commandManager";
import type { ConnectionManager } from "@/core/connectionManager";
import type { SessionStatus } from "@/types/session";

export type BoardManagersContextValue = {
  toolManagerRef: React.RefObject<ToolManager | null>;
  commandManagerRef: React.RefObject<CommandManager | null>;
  connectionManagerRef: React.RefObject<ConnectionManager | null>;
  sessionStatus: SessionStatus;
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
