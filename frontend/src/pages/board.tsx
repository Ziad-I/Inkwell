import { useEffect, useRef } from "react";
import InfiniteCanvas from "@/components/board/canvas";
import Toolbar from "@/components/board/toolbar";
import { useStageOperations } from "@/hooks/useStageOperations";
import { ToolManager } from "@/core/toolManager";
import type { ToolContext } from "@/types/tool";
import { CommandManager } from "@/core/commandManager";
import { useUserStore } from "@/stores/userStore";

function BoardPage() {
  const userId = useUserStore((s) => s.userId);

  const toolManagerRef = useRef<ToolManager | null>(null);
  const commandManagerRef = useRef<CommandManager | null>(null);

  const { stageOperations, stageRef, drawingLayerRef, overlayLayerRef } =
    useStageOperations();

  useEffect(() => {
    async function initManagers() {
      commandManagerRef.current = new CommandManager(userId, stageOperations);

      const ctx: ToolContext = {
        stageOps: stageOperations,
        commandManager: commandManagerRef.current,
      };
      const mgr = new ToolManager(ctx);
      toolManagerRef.current = mgr;
      await mgr.initTools();

      console.log("Managers initialized");
    }

    initManagers();
  }, []);

  return (
    <div>
      <Toolbar toolManagerRef={toolManagerRef} />
      <InfiniteCanvas
        overlayLayerRef={overlayLayerRef}
        toolManagerRef={toolManagerRef}
        commandManagerRef={commandManagerRef}
        stageRef={stageRef}
        drawingLayerRef={drawingLayerRef}
        stageOperations={stageOperations}
      />
    </div>
  );
}

export default BoardPage;
