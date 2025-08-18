import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import ToolButton from "@/components/board/toolButton";
import ToolSettings from "@/components/board/toolSettings";
import type { Tools } from "@/tools/types";

export default function Toolbar() {
  const [activeTool, setActiveTool] = useState<Tools | null>("brush");
  const [isSpacePressed] = useState(false); // keep original behaviour — wire keyboard handlers where you use the component
  const [availableTools] = useState<Tools[]>(["brush", "eraser"]);

  return (
    <Card className="fixed top-1/2 left-4 transform -translate-y-1/2 z-30 p-2 bg-muted">
      <div className="flex flex-col items-center gap-2">
        <div className="flex flex-col gap-1">
          {availableTools.map((toolId) => (
            <ToolButton
              key={toolId}
              toolId={toolId}
              isActive={activeTool === toolId}
              onClick={() => setActiveTool(toolId)}
            />
          ))}
        </div>

        <Separator orientation="horizontal" className="w-8" />

        {/* Tool Info */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs font-medium text-center">
            {isSpacePressed ? "Pan Mode" : activeTool ? activeTool : "No Tool"}
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
