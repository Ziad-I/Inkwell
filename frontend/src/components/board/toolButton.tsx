import React from "react";
import { Button } from "@/components/ui/button";
import { Tools } from "@/tools/types";
import { Brush, Eraser } from "lucide-react";

const toolIcons: Record<Tools, any> = {
  [Tools.Brush]: Brush,
  [Tools.Eraser]: Eraser,
};

const toolLabels: Record<Tools, string> = {
  [Tools.Brush]: "Brush",
  [Tools.Eraser]: "Eraser",
};

interface ToolButtonProps {
  toolId: Tools;
  isActive?: boolean;
  onClick?: () => void;
}

export default function ToolButton({
  toolId,
  isActive = false,
  onClick,
}: ToolButtonProps) {
  const IconComponent = toolIcons[toolId];
  const label = toolLabels[toolId];

  return (
    <Button
      variant={isActive ? "default" : "secondary"}
      size="icon"
      className="flex flex-col gap-1 p-1 border-2"
      title={label}
      onClick={onClick}
    >
      <IconComponent size={14} />
    </Button>
  );
}
