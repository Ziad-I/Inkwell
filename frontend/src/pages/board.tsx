import { useEffect, useRef } from "react";
import InfiniteCanvas from "@/components/board/canvas";
import Toolbar from "@/components/board/toolbar";
import { useStageOperations } from "@/hooks/useStageOperations";
import { ToolManager } from "@/core/toolManager";
import type { ToolContext } from "@/types/tool";
import { HistoryManager } from "@/core/historyManager";
import { useHistoryOperations } from "@/hooks/useHistoryOperations";

function BoardPage() {
  const toolManagerRef = useRef<ToolManager | null>(null);
  const historyManagerRef = useRef<HistoryManager | null>(null);
  const { stageOperations, stageRef, drawingLayerRef, overlayLayerRef } =
    useStageOperations();
  const { historyOperations } = useHistoryOperations(historyManagerRef);

  useEffect(() => {
    async function initHistoryManager() {
      if (historyManagerRef.current) return;
      historyManagerRef.current = new HistoryManager();
    }

    async function initToolManager() {
      if (toolManagerRef.current) return;
      const ctx: ToolContext = {
        stageOps: stageOperations!,
        historyOps: historyOperations!,
      };

      const mgr = new ToolManager(ctx);
      await mgr.initTools();
      toolManagerRef.current = mgr;
    }

    initHistoryManager();
    initToolManager();
  }, []);

  return (
    <div>
      <Toolbar toolManagerRef={toolManagerRef} />
      <InfiniteCanvas
        overlayLayerRef={overlayLayerRef}
        toolManagerRef={toolManagerRef}
        stageOperations={stageOperations}
        stageRef={stageRef}
        drawingLayerRef={drawingLayerRef}
      />
    </div>
  );
}

export default BoardPage;
