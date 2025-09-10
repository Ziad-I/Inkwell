import { useEffect, useRef } from "react";
import InfiniteCanvas from "@/components/board/canvas";
import Toolbar from "@/components/board/toolbar";
import { useStageOperations } from "@/hooks/useStageOperations";
import { ToolManager } from "@/core/toolManager";
import type { ToolContext } from "@/types/tool";
import { CommandManager } from "@/core/commandManager";
import { useCommandOperations } from "@/hooks/useHistoryOperations";

function BoardPage() {
  const toolManagerRef = useRef<ToolManager | null>(null);
  const commandManagerRef = useRef<CommandManager | null>(null);
  const { stageOperations, stageRef, drawingLayerRef, overlayLayerRef } =
    useStageOperations();
  const { commandOperations: commandOperations } =
    useCommandOperations(commandManagerRef);

  useEffect(() => {
    async function initCommandManager() {
      if (commandManagerRef.current) return;
      commandManagerRef.current = new CommandManager();
    }

    async function initToolManager() {
      if (toolManagerRef.current) return;
      const ctx: ToolContext = {
        stageOps: stageOperations!,
        commandOps: commandOperations!,
      };

      const mgr = new ToolManager(ctx);
      await mgr.initTools();
      toolManagerRef.current = mgr;
    }

    initCommandManager();
    initToolManager();
  }, []);

  return (
    <div>
      <Toolbar toolManagerRef={toolManagerRef} />
      <InfiniteCanvas
        overlayLayerRef={overlayLayerRef}
        toolManagerRef={toolManagerRef}
        stageRef={stageRef}
        drawingLayerRef={drawingLayerRef}
        stageOperations={stageOperations}
        commandOperations={commandOperations}
      />
    </div>
  );
}

export default BoardPage;
