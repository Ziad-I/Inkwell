import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ToolManager } from "@/core/toolManager";
import { CommandManager } from "@/core/commandManager";
import { ConnectionManager } from "@/core/connectionManager";
import type { StageOperations } from "@/types/common";
import { BoardManagersContext } from "@/context/boardManagersContext";
import type { SessionStatus } from "@/types/session";
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

  const [sessionStatus, setSessionStatus] = useState<SessionStatus>({
    status: "idle",
  });

  useEffect(() => {
    if (!userId || !roomId) return;

    let cancelled = false;
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
        (status: SessionStatus) => {
          if (!cancelled) {
            console.log("[CommandManager] Session status changed:", status);
            setSessionStatus(status);
          }
        },
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
      sessionStatus,
    }),
    [sessionStatus],
  );

  return (
    <BoardManagersContext.Provider value={value}>
      {children}
    </BoardManagersContext.Provider>
  );
}
