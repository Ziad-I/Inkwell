import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ToolManager } from "@/core/toolManager";
import { CommandManager } from "@/core/commandManager";
import { ConnectionManager } from "@/core/connectionManager";
import type { ToolContext } from "@/types/tool";
import type { StageOperations } from "@/types/common";
import { BoardManagersContext } from "@/context/boardManagersContext";

interface BoardManagersProviderProps {
  userId: string;
  userName: string;
  userColor: string;
  url: string;
  roomId: string;
  stageOperations: StageOperations;
  children: ReactNode;
}

export function BoardManagersProvider({
  userId,
  userName,
  userColor,
  url,
  roomId,
  stageOperations,
  children,
}: BoardManagersProviderProps) {
  const toolManagerRef = useRef<ToolManager | null>(null);
  const commandManagerRef = useRef<CommandManager | null>(null);
  const connectionManagerRef = useRef<ConnectionManager | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!userId || !roomId) return;

    let cancelled = false;

    async function initManagers() {
      if (!userId) return;

      const connection = new ConnectionManager(url, {
        auth: { userId, userName, userColor },
      });

      const commandMgr = new CommandManager(
        userId,
        roomId,
        stageOperations,
        connection,
      );

      const ctx: ToolContext = {
        stageOps: stageOperations,
        commandManager: commandMgr,
      };

      const mgr = new ToolManager(ctx);

      // Assign refs before initiating the connection
      connectionManagerRef.current = connection;
      commandManagerRef.current = commandMgr;
      toolManagerRef.current = mgr;

      await mgr.initTools();
      connection.connect();

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
  }, [stageOperations, url, userColor, userId, userName, roomId]);

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
