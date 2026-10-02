import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import ToolButton from "@/components/board/toolbar/toolButton";
import { useBoardManagers } from "@/context/boardManagersContext";
import type { Tools } from "@/types/tool";
import { useToolStore } from "@/stores/toolStore";

export default function Toolbar() {
  const { toolManagerRef } = useBoardManagers();

  const activeTool = useToolStore((state) => state.activeToolId);
  const allTools = useToolStore((state) => state.allTools);

  const handleToolClick = (toolId: Tools) => {
    toolManagerRef.current?.activateTool(toolId);
  };

  return (
    <Card className="fixed top-4 left-1/2 transform -translate-x-1/2 z-30 p-2 bg-muted">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {allTools.map((tool) => (
            <div key={tool.id}>
              <ToolButton
                toolId={tool.id}
                toolLabel={tool.label!}
                toolIcon={tool.icon!}
                isActive={tool.id === activeTool}
                onClick={() => handleToolClick(tool.id)}
              />
            </div>
          ))}
        </div>

        <Separator orientation="vertical" className="self-stretch" />

        <div className="flex items-center gap-1">
          <span className="text-xs font-medium">
            {activeTool ? activeTool : "No Tool"}
          </span>
        </div>
      </div>
    </Card>
  );
}
