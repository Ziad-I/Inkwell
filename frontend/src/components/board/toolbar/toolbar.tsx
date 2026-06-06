import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import ToolButton from "@/components/board/toolbar/toolButton";
import ToolSettings from "@/components/board/toolbar/toolSettings";
import { useBoardManagers } from "@/context/boardManagersContext";
import type { Tools } from "@/types/tool";
import { useToolStore } from "@/stores/toolStore";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Toolbar() {
  const { toolManagerRef } = useBoardManagers();

  const activeTool = useToolStore((state) => state.activeToolId);
  const allTools = useToolStore((state) => state.allTools);

  const [collapsed, setCollapsed] = useState(false);

  const handleToolClick = (toolId: Tools) => {
    toolManagerRef.current?.activateTool(toolId);
  };

  return (
    <Card className="fixed top-1/2 left-4 transform -translate-y-1/2 z-30 p-2 bg-muted">
      <div className="flex flex-col items-center gap-2">
        {/* collapse toggle */}
        <Button
          aria-label={collapsed ? "Expand toolbar" : "Collapse toolbar"}
          variant="outline"
          size="icon"
          onClick={() => setCollapsed((s) => !s)}
          className="rounded-full"
        >
          {collapsed ? <ChevronRight /> : <ChevronLeft />}
        </Button>

        <Separator orientation="horizontal" />

        {/* Expanded view */}
        {!collapsed ? (
          <div className="flex flex-col items-center gap-2">
            {/* Tools grid (2 per row) */}
            <div className="grid grid-cols-2 gap-1 place-items-center">
              {allTools.map((tool) => (
                <div
                  key={tool.id}
                  className="w-10 h-10 flex items-center justify-center"
                >
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

            <Separator orientation="horizontal" className="w-8" />

            {/* Tool Info */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs font-medium text-center">
                {activeTool ? activeTool : "No Tool"}
              </span>
            </div>

            <Separator orientation="horizontal" className="w-8" />

            {/* Tool Settings (expanded - shows labels) */}
            <div className="w-full max-w-[200px]">
              <ToolSettings />
            </div>
          </div>
        ) : (
          /* Collapsed view: narrow vertical strip with icons only */
          <div className="flex flex-col items-center gap-1">
            {/* Tools: icon-only column */}
            <div className="flex flex-col items-center gap-1">
              {allTools.map((tool) => (
                <div
                  key={tool.id}
                  className="w-10 h-10 flex items-center justify-center"
                >
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

            <Separator orientation="horizontal" className="w-2" />

            {/* Settings: compact icon-only version passed via prop */}
            <div className="flex flex-col items-center">
              <ToolSettings compact />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
