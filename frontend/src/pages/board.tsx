import InfiniteCanvas from "@/components/board/canvas";
import Toolbar from "@/components/board/toolbar";
import { useStageOperations } from "@/hooks/useStageOperations";

function BoardPage() {
  const { stageOperations, stageRef, drawingLayerRef } = useStageOperations();

  return (
    <div>
      <Toolbar />
      <InfiniteCanvas
        stageOperations={stageOperations}
        stageRef={stageRef}
        drawingLayerRef={drawingLayerRef}
      />
    </div>
  );
}

export default BoardPage;
