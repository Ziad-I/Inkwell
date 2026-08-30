import { useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { BoardManagersProvider } from "@/providers/managersProvider";
import { useStageOperations } from "@/hooks/useStageOperations";
import { LoadingSpinner } from "@/components/home/LoadingSpinner";
import ToolSettings from "@/components/board/toolbar/toolSettings";
import Toolbar from "@/components/board/toolbar/toolbar";
import InfiniteCanvas from "@/components/board/canvas/canvas";
import { useSessionStore } from "@/stores/sessionStore";
import { toast } from "sonner";

function BoardPage() {
  const { stageOperations, stageRef, drawingLayerRef, overlayLayerRef } =
    useStageOperations();

  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const session = useSessionStore((state) => state.session);

  useEffect(() => {
    if (!roomId) {
      navigate("/", { replace: true });
    }
  }, [roomId, navigate]);

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
    <BoardManagersProvider
      url={import.meta.env.VITE_BACKEND_WS_URL}
      roomId={roomId!}
      stageOperations={stageOperations}
    >
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
    </BoardManagersProvider>
  );
}

export default BoardPage;
