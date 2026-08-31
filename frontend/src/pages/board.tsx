import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import type Konva from "konva";
import { BoardManagersProvider } from "@/providers/managersProvider";
import { useStageOperations } from "@/hooks/useStageOperations";
import { LoadingSpinner } from "@/components/home/LoadingSpinner";
import { Button } from "@/components/ui/button";
import ToolSettings from "@/components/board/toolbar/toolSettings";
import Toolbar from "@/components/board/toolbar/toolbar";
import InfiniteCanvas from "@/components/board/canvas/canvas";
import { useSessionStore } from "@/stores/sessionStore";
import type { StageOperations } from "@/types/common";
import type { SessionPhase } from "@/types/session";

function BoardPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!roomId) {
      navigate("/", { replace: true });
    }
  }, [roomId, navigate]);

  if (!roomId) {
    return null;
  }

  // The key remounts the complete stage subtree — stage refs, the detached
  // node registry, managers, provider, and canvas — whenever the room
  // changes, so no stage or session state can leak across rooms.
  return <BoardRoom key={roomId} roomId={roomId} />;
}

interface BoardRoomProps {
  roomId: string;
}

function BoardRoom({ roomId }: BoardRoomProps) {
  // Remounting the runtime (provider included) is the retry path for a
  // terminal session error: the coordinator never retries failed joins.
  const [runtimeKey, setRuntimeKey] = useState(0);
  const handleRetry = () => setRuntimeKey((key) => key + 1);

  return (
    <BoardRuntimeRoot key={runtimeKey} roomId={roomId} onRetry={handleRetry} />
  );
}

interface BoardRuntimeRootProps {
  roomId: string;
  onRetry: () => void;
}

function BoardRuntimeRoot({ roomId, onRetry }: BoardRuntimeRootProps) {
  const {
    stageOperations,
    stageRef,
    drawingLayerRef,
    overlayLayerRef,
    presenceLayerRef,
  } = useStageOperations();

  return (
    <BoardManagersProvider
      url={import.meta.env.VITE_BACKEND_WS_URL}
      roomId={roomId}
      stageOperations={stageOperations}
    >
      <BoardRuntime
        stageRef={stageRef}
        drawingLayerRef={drawingLayerRef}
        overlayLayerRef={overlayLayerRef}
        presenceLayerRef={presenceLayerRef}
        stageOperations={stageOperations}
        onRetry={onRetry}
      />
    </BoardManagersProvider>
  );
}

interface BoardRuntimeProps {
  stageRef: React.RefObject<Konva.Stage | null>;
  drawingLayerRef: React.RefObject<Konva.Layer | null>;
  overlayLayerRef: React.RefObject<Konva.Layer | null>;
  presenceLayerRef: React.RefObject<Konva.Layer | null>;
  stageOperations: StageOperations;
  onRetry: () => void;
}

type SessionOverlay =
  | { kind: "notice"; message: string }
  | { kind: "error"; message: string };

function sessionOverlay(phase: SessionPhase): SessionOverlay | null {
  switch (phase) {
    case "idle":
    case "connecting":
    case "joining":
    case "syncing":
      return { kind: "notice", message: "Loading board…" };
    case "offline":
      return { kind: "notice", message: "Connection lost. Reconnecting…" };
    case "reconciling":
      return {
        kind: "notice",
        message: "Checking the latest board state…",
      };
    case "error":
      return { kind: "error", message: "Unable to join the board." };
    case "ready":
      return null;
  }
}

function BoardRuntime({
  stageRef,
  drawingLayerRef,
  overlayLayerRef,
  presenceLayerRef,
  stageOperations,
  onRetry,
}: BoardRuntimeProps) {
  const session = useSessionStore((state) => state.session);
  const overlay = sessionOverlay(session.phase);

  return (
    <div>
      <Toolbar />
      <ToolSettings />
      <InfiniteCanvas
        stageRef={stageRef}
        drawingLayerRef={drawingLayerRef}
        overlayLayerRef={overlayLayerRef}
        presenceLayerRef={presenceLayerRef}
        stageOperations={stageOperations}
      />

      {overlay?.kind === "notice" && (
        // Non-blocking: the board stays visible and interactive beneath
        // (mutation is already disabled in every non-ready phase).
        <div
          role="status"
          className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 pointer-events-none"
        >
          <div className="flex flex-col items-center gap-3 bg-muted p-6 rounded-lg shadow-lg">
            <LoadingSpinner />
            <p className="text-sm font-medium">{overlay.message}</p>
          </div>
        </div>
      )}

      {overlay?.kind === "error" && (
        <div
          role="alert"
          className="absolute inset-0 z-50 flex items-center justify-center bg-background/90"
        >
          <div className="flex flex-col items-center gap-4 bg-muted p-6 rounded-lg shadow-lg">
            <p className="text-sm font-medium">{overlay.message}</p>
            <Button onClick={onRetry}>Retry</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default BoardPage;
