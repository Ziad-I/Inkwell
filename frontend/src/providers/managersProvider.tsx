import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ToolManager } from "@/core/toolManager";
import { CommandManager } from "@/core/commandManager";
import { ConnectionManager } from "@/core/connectionManager";
import type { ToolContext } from "@/types/tool";
import type { StageOperations } from "@/types/common";
import { BoardManagersContext } from "@/context/boardManagersContext";

interface BoardManagersProviderProps {
  userId: string;
  url: string;
  stageOperations: StageOperations;
  children: ReactNode;
}

export function BoardManagersProvider({
  userId,
  url,
  stageOperations,
  children,
}: BoardManagersProviderProps) {
  const toolManagerRef = useRef<ToolManager | null>(null);
  const commandManagerRef = useRef<CommandManager | null>(null);
  const connectionManagerRef = useRef<ConnectionManager | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function initManagers() {
      if (!userId) return;

      connectionManagerRef.current = new ConnectionManager(url);
      connectionManagerRef.current.connect();

      commandManagerRef.current = new CommandManager(
        userId,
        stageOperations,
        connectionManagerRef.current,
      );
      commandManagerRef.current.registerServerListeners();

      const ctx: ToolContext = {
        stageOps: stageOperations,
        commandManager: commandManagerRef.current,
      };

      const mgr = new ToolManager(ctx);
      toolManagerRef.current = mgr;
      await mgr.initTools();

      if (!cancelled) {
        setReady(true);
      }
    }

    initManagers();

    return () => {
      cancelled = true;
      connectionManagerRef.current?.disconnect?.();
      toolManagerRef.current?.destroy?.();
      commandManagerRef.current?.destroy?.();
    };
  }, [stageOperations, url, userId]);

  const value = useMemo(
    () => ({
      toolManagerRef,
      commandManagerRef,
      connectionManagerRef,
      ready,
    }),
    [ready],
  );

  return (
    <BoardManagersContext.Provider value={value}>
      {children}
    </BoardManagersContext.Provider>
  );
}
