import { useBoardManagers } from "@/context/boardManagersContext";
import type { StageOperations } from "@/types/common";
import type { Layer } from "konva/lib/Layer";
import type { Stage } from "konva/lib/Stage";
import { type RefObject, useEffect } from "react";
import { useNavigate } from "react-router";
import ToolSettings from "@/components/board/toolbar/toolSettings";
import Toolbar from "@/components/board/toolbar/toolbar";
import InfiniteCanvas from "@/components/board/canvas/canvas";
import { LoadingSpinner } from "@/components/home/LoadingSpinner";
import { toast } from "sonner";

interface BoardContentProps {
  stageOperations: StageOperations;
  stageRef: RefObject<Stage | null>;
  drawingLayerRef: RefObject<Layer | null>;
  overlayLayerRef: RefObject<Layer | null>;
}

function BoardSession({
  stageOperations,
  stageRef,
  drawingLayerRef,
  overlayLayerRef,
}: BoardContentProps) {
  const { sessionStatus } = useBoardManagers();
  const navigate = useNavigate();

  useEffect(() => {
    if (sessionStatus.status !== "error") {
      return;
    }

    toast.error("An error occurred while joining the board.");
    navigate("/", { replace: true });
  }, [sessionStatus.status, navigate]);

  const isLoading =
    sessionStatus.status === "idle" ||
    sessionStatus.status === "connecting" ||
    sessionStatus.status === "joining";

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

export default BoardSession;
