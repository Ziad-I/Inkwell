import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { ToolManager } from "@/core/toolManager";
import { CommandManager } from "@/core/commandManager";
import type { MutationCapability } from "@/types/operations";
import { ConnectionManager } from "@/core/connectionManager";
import { BoardDocument } from "@/collaboration/boardDocument";
import { OperationJournal } from "@/collaboration/operationJournal";
import type { StageOperations } from "@/types/common";
import { BoardManagersContext } from "@/context/boardManagersContext";
import { useSessionStore } from "@/stores/sessionStore";
import { useAuthStore } from "@/stores/authStore";
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

    const { setSession, reset } = useSessionStore.getState();
    const { accessToken } = useAuthStore.getState();

    const epoch = `interim:${roomId}:${userId}`;

    setSession({
      epoch,
      roomId,
      phase: "connecting",
      role: null,
      permissions: { read: false, draw: false },
      canDraw: false,
      error: null,
    });

    async function initManagers() {
      if (!userId) return;

      const connection = new ConnectionManager(url, {
        auth: { userId, userName, userColor, token: accessToken },
      });

      const epoch = `interim:${roomId}:${userId}`;
      const capability: MutationCapability = {
        epoch,
        ready: true,
        canDraw: true,
      };

      const commandMgr = new CommandManager({
        epoch,
        userId,
        stageOps: stageOperations,
        connection,
        document: new BoardDocument(),
        journal: new OperationJournal(),
        getCapability: () => capability,
        requestReconciliation: (reason) =>
          console.warn(`[interim] reconciliation requested: ${reason}`),
        notifyCommandFailure: (message) => console.warn(`[interim] ${message}`),
      });

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
