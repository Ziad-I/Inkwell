import type { CommandManager } from "@/core/commandManager";
import type { Command } from "@/types/command";
import { type CommandOperations } from "@/types/common";
import { useRef } from "react";

export function useCommandOperations(
  commandManagerRef: React.RefObject<CommandManager | null>
) {
  const CommandOperations = useRef<CommandOperations>({
    startCommand(command: Command): void {
      commandManagerRef.current?.startCommand(command);
    },

    updatePendingCommand(): void {
      commandManagerRef.current?.updatePendingCommand();
    },

    commitPendingCommand(): boolean {
      return commandManagerRef.current?.commitPendingCommand() ?? false;
    },

    cancelPendingCommand(): void {
      commandManagerRef.current?.cancelPendingCommand();
    },

    hasPendingCommand(): boolean {
      return commandManagerRef.current?.hasPendingCommand() ?? false;
    },

    undo(): boolean {
      return commandManagerRef.current?.undo() ?? false;
    },

    redo(): boolean {
      return commandManagerRef.current?.redo() ?? false;
    },

    clear(): void {
      commandManagerRef.current?.clear();
    },
  });

  return { commandOperations: CommandOperations.current };
}
