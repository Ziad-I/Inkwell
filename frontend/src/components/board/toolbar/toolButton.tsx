import React from "react";
import { Button } from "@/components/ui/button";
import { Tools } from "@/types/tool";
import { type LucideProps } from "lucide-react";

interface ToolButtonProps {
  toolId: Tools;
  toolLabel: string;
  toolIcon: React.ComponentType<LucideProps>;
  isActive?: boolean;
  onClick?: () => void;
}

export default function ToolButton({
  toolId,
  toolLabel,
  toolIcon: ToolIcon,
  isActive = false,
  onClick,
}: ToolButtonProps) {
  return (
    <Button
      variant={isActive ? "default" : "secondary"}
      size="icon"
      className="flex flex-col gap-1 p-1 border-2"
      title={toolLabel}
      onClick={onClick}
    >
      <ToolIcon size={14} />
    </Button>
  );
}
