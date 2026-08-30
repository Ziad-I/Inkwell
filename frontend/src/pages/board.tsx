import { useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import type Konva from "konva";
import { BoardManagersProvider } from "@/providers/managersProvider";
import { useStageOperations } from "@/hooks/useStageOperations";
import { LoadingSpinner } from "@/components/home/LoadingSpinner";
import ToolSettings from "@/components/board/toolbar/toolSettings";
import Toolbar from "@/components/board/toolbar/toolbar";
import InfiniteCanvas from "@/components/board/canvas/canvas";
import { useSessionStore } from "@/stores/sessionStore";
import { toast } from "sonner";
import type { StageOperations } from "@/types/common";

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
  const { stageOperations, stageRef, drawingLayerRef, overlayLayerRef } =
    useStageOperations();

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
        stageOperations={stageOperations}
      />
    </BoardManagersProvider>
  );
}

interface BoardRuntimeProps {
  stageRef: React.RefObject<Konva.Stage | null>;
  drawingLayerRef: React.RefObject<Konva.Layer | null>;
  overlayLayerRef: React.RefObject<Konva.Layer | null>;
  stageOperations: StageOperations;
}

function BoardRuntime({
  stageRef,
  drawingLayerRef,
  overlayLayerRef,
  stageOperations,
}: BoardRuntimeProps) {
  const navigate = useNavigate();
  const session = useSessionStore((state) => state.session);

  useEffect(() => {
    if (session.phase !== "error") {
      return;
    }

    toast.error("An error occurred while joining the board.");
    navigate("/", { replace: true });
  }, [session.phase, navigate]);

  const isLoading =
    session.phase === "idle" ||
    session.phase === "connecting" ||
    session.phase === "joining" ||
    session.phase === "syncing";

  return (
    <div>
      <Toolbar />
      <ToolSettings />
      <InfiniteCanvas
        stageRef={stageRef}
        drawingLayerRef={drawingLayerRef}
        overlayLayerRef={overlayLayerRef}
        stageOperations={stageOperations}
      />

      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center">
          <LoadingSpinner />
        </div>
      )}
    </div>
  );
}

export default BoardPage;
