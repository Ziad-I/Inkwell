import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { ToolManager } from "@/core/toolManager";
import { CommandManager } from "@/core/commandManager";
import { ConnectionManager } from "@/core/connectionManager";
import type { StageOperations } from "@/types/common";
import { BoardManagersContext } from "@/context/boardManagersContext";
import { useSessionStore } from "@/stores/sessionStore";
import { useCollabIdentity } from "@/hooks/useCollabIdentity";

interface BoardManagersProviderProps {
  url: string;
  roomId: string;
  stageOperations: StageOperations;
  children: ReactNode;
}

export function BoardManagersProvider({
  url,
  roomId,
  stageOperations,
  children,
}: BoardManagersProviderProps) {
  const { id: userId, name: userName, color: userColor } = useCollabIdentity();

  const toolManagerRef = useRef<ToolManager | null>(null);
  const commandManagerRef = useRef<CommandManager | null>(null);
  const connectionManagerRef = useRef<ConnectionManager | null>(null);

  useEffect(() => {
    if (!userId || !roomId) return;

    const { setSessionStatus, reset } = useSessionStore.getState();
    setSessionStatus({ status: "connecting" });

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

      const mgr = new ToolManager({
        stageOps: stageOperations,
        commandManager: commandMgr,
      });

      // Assign refs before initiating the connection
      connectionManagerRef.current = connection;
      commandManagerRef.current = commandMgr;
      toolManagerRef.current = mgr;

      await mgr.initTools();
      connection.connect();
    }

    initManagers();

    return () => {
      connectionManagerRef.current?.disconnect?.();
      toolManagerRef.current?.destroy?.();
      commandManagerRef.current?.destroy?.();
      reset();
    };
  }, [stageOperations, url, userColor, userId, userName, roomId]);

  const value = useMemo(
    () => ({
      toolManagerRef,
      commandManagerRef,
      connectionManagerRef,
    }),
    [],
  );

  return (
    <BoardManagersContext.Provider value={value}>
      {children}
    </BoardManagersContext.Provider>
  );
}
