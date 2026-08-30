import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { ToolManager } from "@/core/toolManager";
import { CommandManager } from "@/core/commandManager";
import type { MutationCapability } from "@/types/operations";
import { ConnectionManager } from "@/core/connectionManager";
import { activeBoardSessionSlot } from "@/collaboration/sessionSlot";
import { BoardDocument } from "@/collaboration/boardDocument";
import { OperationJournal } from "@/collaboration/operationJournal";
import { BoardSession } from "@/collaboration/boardSession";
import type { Point } from "@/types/command";
import type { StageOperations } from "@/types/common";
import { BoardManagersContext } from "@/context/boardManagersContext";
import { useSessionStore } from "@/stores/sessionStore";
import { useAuthStore } from "@/stores/authStore";
import { useCollabIdentity } from "@/hooks/useCollabIdentity";
import type { BoardSessionSnapshot } from "@/types/session";

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

  const [epoch, setEpoch] = useState("");
  const toolManagerRef = useRef<ToolManager | null>(null);
  const commandManagerRef = useRef<CommandManager | null>(null);
  const coordinatorRef = useRef<BoardSession | null>(null);

  const emitPresence = useCallback(
    (pos: Point) => coordinatorRef.current?.emitPresence(pos) ?? false,
    [],
  );

  useEffect(() => {
    if (!userId || !roomId) return;

    const abortController = new AbortController();
    const epoch = crypto.randomUUID();
    const { accessToken } = useAuthStore.getState();

    // Every instance below is local to this effect run. Cleanup and the
    // post-initialization checks close over these locals — never over refs —
    // so a stale epoch can never touch a newer one.
    const connection = new ConnectionManager(url, {
      auth: { userId, userName, userColor, token: accessToken },
    });
    const document = new BoardDocument();
    const journal = new OperationJournal();

    // The coordinator needs the command manager, while the command
    // manager's capability gate needs the coordinator's snapshot. A const
    // holder breaks the cycle and gives both closures epoch-scoped
    // access to this run's coordinator only.
    const activeCoordinator: { current: BoardSession | null } = {
      current: null,
    };

    const commandMgr = new CommandManager({
      epoch,
      userId,
      stageOps: stageOperations,
      connection,
      document,
      journal,
      getCapability: (): MutationCapability => {
        const snapshot = activeCoordinator.current?.getSnapshot();
        if (!snapshot || snapshot.epoch !== epoch) {
          return { epoch, ready: false, canDraw: false };
        }
        return {
          epoch: snapshot.epoch,
          ready: snapshot.phase === "ready",
          canDraw: snapshot.canDraw,
        };
      },
      requestReconciliation: (reason) => {
        activeCoordinator.current?.requestReconciliation(reason);
      },
      notifyCommandFailure: (message) => {
        toast.error(message);
      },
    });

    const toolManager = new ToolManager({
      stageOps: stageOperations,
      commandManager: commandMgr,
    });

    const localCoordinator = new BoardSession({
      epoch,
      roomId,
      connection,
      commands: commandMgr,
      document,
      journal,
      // TODO: ToolManager.cancelActiveGesture will be done later.
      // Deactivating the effective tool cancels its in-flight gesture (e.g.
      // BrushTool.onDeactivate cancels a pending stroke command) without
      // unregistering the tool.
      cancelGesture: () => {
        toolManager.getEffectiveTool()?.onDeactivate?.();
      },
      // TODO: remote presence display is to be rewired later. The
      // presence store only holds the local anonymous identity; resetting it
      // on every disconnect/reconciliation would revert the user's chosen
      // name and color, so there is nothing to clear here yet.
      clearPresence: () => {},
      publish: (snapshot: BoardSessionSnapshot) => {
        useSessionStore.getState().setSession(snapshot);
      },
    });
    activeCoordinator.current = localCoordinator;

    // Register before starting so the coordinator stays disposable through
    // the registry (the logout boundary) even if this effect's own cleanup
    // never runs.
    const unregister = activeBoardSessionSlot.register({
      epoch,
      dispose: () => {
        localCoordinator.dispose();
      },
    });

    toolManagerRef.current = toolManager;
    commandManagerRef.current = commandMgr;
    coordinatorRef.current = localCoordinator;
    setEpoch(epoch);

    let finalized = false;
    const finalizeLocal = () => {
      if (finalized) {
        return;
      }
      finalized = true;
      localCoordinator.dispose();
      toolManager.destroy();
      commandMgr.destroy();
      connection.disconnect();
      stageOperations.resetRoomScene();
    };

    void (async () => {
      try {
        await toolManager.initTools();
      } catch (error) {
        console.error("Tool initialization failed", error);
      }

      const stale =
        abortController.signal.aborted ||
        toolManagerRef.current !== toolManager ||
        commandManagerRef.current !== commandMgr ||
        coordinatorRef.current !== localCoordinator;

      if (stale) {
        // A newer epoch or this effect's cleanup already took over:
        // destroy the local instances and never connect.
        finalizeLocal();
        return;
      }

      localCoordinator.start();
    })();

    return () => {
      abortController.abort();
      unregister();
      finalizeLocal();
      useSessionStore.getState().reset();
      // Clear refs only if this epoch still owns them.
      if (toolManagerRef.current === toolManager) {
        toolManagerRef.current = null;
      }
      if (commandManagerRef.current === commandMgr) {
        commandManagerRef.current = null;
      }
      if (coordinatorRef.current === localCoordinator) {
        coordinatorRef.current = null;
      }
    };
  }, [stageOperations, url, userColor, userId, userName, roomId]);

  const value = useMemo(
    () => ({
      epoch,
      toolManagerRef,
      commandManagerRef,
      coordinatorRef,
      emitPresence,
    }),
    [epoch, emitPresence],
  );

  return (
    <BoardManagersContext.Provider value={value}>
      {children}
    </BoardManagersContext.Provider>
  );
}
