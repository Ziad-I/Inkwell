import type { HistoryManager } from "@/core/historyManager";
import type { Command } from "@/types/command";
import { type historyOperations } from "@/types/common";
import { useRef } from "react";

export function useHistoryOperations(
  historyManagerRef: React.RefObject<HistoryManager | null>
) {
  const historyOperations = useRef<historyOperations>({
    startCommand(command: Command): void {
      historyManagerRef.current?.startCommand(command);
    },

    updatePendingCommand(): void {
      historyManagerRef.current?.updatePendingCommand();
    },

    commitPendingCommand(): boolean {
      return historyManagerRef.current?.commitPendingCommand() ?? false;
    },

    cancelPendingCommand(): void {
      historyManagerRef.current?.cancelPendingCommand();
    },

    hasPendingCommand(): boolean {
      return historyManagerRef.current?.hasPendingCommand() ?? false;
    },

    undo(): boolean {
      return historyManagerRef.current?.undo() ?? false;
    },

    redo(): boolean {
      return historyManagerRef.current?.redo() ?? false;
    },

    clear(): void {
      historyManagerRef.current?.clear();
    },
  });

  return { historyOperations: historyOperations.current };
}
