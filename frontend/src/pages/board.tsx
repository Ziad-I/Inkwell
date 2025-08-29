import { useEffect, useRef } from "react";
import InfiniteCanvas from "@/components/board/canvas";
import Toolbar from "@/components/board/toolbar";
import { useStageOperations } from "@/hooks/useStageOperations";
import { ToolManager } from "@/core/toolManager";
import type { ToolContext } from "@/types/tool";

function BoardPage() {
  const { stageOperations, stageRef, drawingLayerRef } = useStageOperations();
  const toolManagerRef = useRef<ToolManager | null>(null);

  useEffect(() => {
    async function initToolManager() {
      if (toolManagerRef.current) return;
      const ctx: ToolContext = {
        stageOps: stageOperations!,
      };

      const mgr = new ToolManager(ctx);
      await mgr.initTools();
      toolManagerRef.current = mgr;
    }
    initToolManager();
  }, []);

  return (
    <div>
      <Toolbar toolManagerRef={toolManagerRef} />
      <InfiniteCanvas
        toolManagerRef={toolManagerRef}
        stageOperations={stageOperations}
        stageRef={stageRef}
        drawingLayerRef={drawingLayerRef}
      />
    </div>
  );
}

export default BoardPage;
