import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import ToolButton from "@/components/board/toolButton";
import ToolSettings from "@/components/board/toolSettings";
import type { Tools } from "@/types/tool";
import type { ToolManager } from "@/core/toolManager";
import { useToolStore } from "@/stores/toolStore";

interface ToolbarProps {
  toolManagerRef: React.RefObject<ToolManager | null>;
}

export default function Toolbar({ toolManagerRef }: ToolbarProps) {
  const activeTool = useToolStore((state) => state.activeToolId);
  const allTools = useToolStore((state) => state.allTools);

  const handleToolClick = (toolId: Tools) => {
    toolManagerRef.current?.activateTool(toolId);
  };

  return (
    <Card className="fixed top-1/2 left-4 transform -translate-y-1/2 z-30 p-2 bg-muted">
      <div className="flex flex-col items-center gap-2">
        <div className="flex flex-col gap-1">
          {allTools.map((tool) => (
            <ToolButton
              key={tool.id}
              toolId={tool.id}
              toolLabel={tool.label!}
              toolIcon={tool.icon!}
              isActive={tool.id === activeTool}
              onClick={() => handleToolClick(tool.id)}
            />
          ))}
        </div>

        <Separator orientation="horizontal" className="w-8" />

        {/* Tool Info */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs font-medium text-center">
            {activeTool ? activeTool : "No Tool"}
          </span>
        </div>

        <Separator orientation="horizontal" className="w-8" />

        {/* Tool Settings */}
        <div className="w-full max-w-[200px]">
          <ToolSettings />
        </div>
      </div>
    </Card>
  );
}
