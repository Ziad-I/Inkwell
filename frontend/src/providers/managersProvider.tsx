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
import { activeBoardSessionSlot as activeBoardSessionRegistry } from "@/collaboration/sessionSlot";
import { BoardDocument } from "@/collaboration/boardDocument";
import { OperationJournal } from "@/collaboration/operationJournal";
import { SessionCordinator as BoardSessionCoordinator } from "@/collaboration/sessionCordinator";
import type { StageOperations } from "@/types/common";
import type { Point } from "@/types/common";
import { Tools } from "@/types/tool";
import { BoardManagersContext } from "@/context/boardManagersContext";
import { useSessionStore } from "@/stores/sessionStore";
import { useRemotePresenceStore } from "@/stores/remotePresenceStore";
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

  const [epoch, setEpoch] = useState("");
  const toolManagerRef = useRef<ToolManager | null>(null);
  const commandManagerRef = useRef<CommandManager | null>(null);
  const coordinatorRef = useRef<BoardSessionCoordinator | null>(null);

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

    // Token rotations must never recreate the session: the auth store is
    // watched for access-token changes and each rotation is merged into
    // THIS generation's handshake auth (used by the next connect or
    // reconnect) while the healthy socket stays connected. Identity
    // changes are effect dependencies, so the captured identity fields
    // stay valid for this subscription's lifetime
    const unsubscribeAuth = useAuthStore.subscribe((state, prev) => {
      if (state.accessToken === prev.accessToken) {
        return;
      }
      connection.setAuth({
        userId,
        userName,
        userColor,
        token: state.accessToken,
      });
    });

    const document = new BoardDocument();
    const journal = new OperationJournal();

    // The coordinator needs the command manager, while the command
    // manager's capability gate needs the coordinator's snapshot. A const
    // holder breaks the cycle and gives both closures epoch-scoped
    // access to this run's coordinator only.
    const activeCoordinator: { current: BoardSessionCoordinator | null } = {
      current: null,
    };

    // One capability source shared by the command and tool managers: the
    // coordinator snapshot of this epoch. A foreign or missing
    // snapshot always resolves to a not-ready capability.
    const getCapability = (): MutationCapability => {
      const snapshot = activeCoordinator.current?.getSnapshot();
      if (!snapshot || snapshot.epoch !== epoch) {
        return { epoch, ready: false, canDraw: false };
      }
      return {
        epoch: snapshot.epoch,
        ready: snapshot.phase === "ready",
        canDraw: snapshot.canDraw,
      };
    };

    const commandMgr = new CommandManager({
      epoch,
      userId,
      stageOps: stageOperations,
      connection,
      document,
      journal,
      getCapability,
      requestReconciliation: (reason) => {
        activeCoordinator.current?.requestReconciliation(reason);
      },
      notifyCommandFailure: (message) => {
        toast.error(message);
      },
    });

    const toolManager = new ToolManager(
      {
        stageOps: stageOperations,
        commandManager: commandMgr,
      },
      undefined,
      getCapability,
    );

    // Mutating tool activation is capability-gated and the session is
    // never ready before the coordinator starts, so the default tool is
    // activated once the first ready-and-drawable snapshot is published.
    let defaultToolActivated = false;

    const localCoordinator = new BoardSessionCoordinator({
      epoch,
      roomId,
      connection,
      commands: commandMgr,
      document,
      journal,
      // The coordinator owns gesture cancellation: switching capability
      // phases must cancel the effective tool's in-flight gesture.
      cancelGesture: () => {
        toolManager.cancelActiveGesture();
      },
      // Remote presence is session-scoped state: cleared on disconnect,
      // reconciliation, and teardown so stale users never render.
      clearPresence: () => {
        useRemotePresenceStore.getState().clearAll();
      },
      onPresenceJoin: (remoteUserId, meta) => {
        useRemotePresenceStore.getState().applyJoin(remoteUserId, meta);
      },
      onPresenceMove: (remoteUserId, pos) => {
        useRemotePresenceStore.getState().applyMove(remoteUserId, pos);
      },
      onPresenceLeave: (remoteUserId) => {
        useRemotePresenceStore.getState().applyLeave(remoteUserId);
      },
      publish: (snapshot) => {
        useSessionStore.getState().setSession(snapshot);
        if (
          !defaultToolActivated &&
          snapshot.phase === "ready" &&
          snapshot.canDraw
        ) {
          defaultToolActivated = true;
          void toolManager.activateTool(Tools.Brush).catch(() => {
            // A board without a brush loader keeps no default tool.
          });
        }
      },
    });
    activeCoordinator.current = localCoordinator;

    // Single guarded teardown for the connection-critical pair
    // (coordinator + transport). Both the registry's dispose handle
    // (the logout boundary) and this effect's own cleanup independently
    // reach this generation's teardown — a registry-triggered dispose can
    // race a React re-render caused by the same logout (e.g. an identity
    // change flowing through useCollabIdentity), so both paths must fold
    // into one guarded call rather than each invoking
    // localCoordinator.dispose()/connection.disconnect() on their own.
    let disposedConnection = false;
    const disposeConnection = () => {
      if (disposedConnection) {
        return;
      }
      disposedConnection = true;
      localCoordinator.dispose();
      connection.disconnect();
    };

    // Register before starting so the coordinator stays disposable through
    // the registry (the logout boundary) even if this effect's own cleanup
    // never runs.
    const unregister = activeBoardSessionRegistry.register({
      epoch,
      dispose: disposeConnection,
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
      disposeConnection();
      toolManager.destroy();
      commandMgr.destroy();
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

      connection.setAuth({
        userId,
        userName,
        userColor,
        token: useAuthStore.getState().accessToken,
      });
      localCoordinator.start();
    })();

    return () => {
      abortController.abort();
      unsubscribeAuth();
      unregister();
      finalizeLocal();
      useSessionStore.getState().reset();
      // Remote users belong to this epoch's session; the cleanup runs
      // before any newer epoch connects, so clearing here can never
      // wipe a successor's presence.
      useRemotePresenceStore.getState().clearAll();
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
