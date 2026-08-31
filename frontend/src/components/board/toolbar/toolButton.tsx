import React from "react";
import { Button } from "@/components/ui/button";
import { Tools } from "@/types/tool";
import { type LucideProps } from "lucide-react";

interface ToolButtonProps {
  toolId: Tools;
  toolLabel: string;
  toolIcon: React.ComponentType<LucideProps>;
  isActive?: boolean;
  disabled?: boolean;
  /** Explanation appended to the title while the button is disabled. */
  disabledReason?: string;
  onClick?: () => void;
}

export default function ToolButton({
  toolId,
  toolLabel,
  toolIcon: ToolIcon,
  isActive = false,
  disabled = false,
  disabledReason,
  onClick,
}: ToolButtonProps) {
  const title =
    disabled && disabledReason ? `${toolLabel} — ${disabledReason}` : toolLabel;

  return (
    <Button
      key={toolId}
      variant={isActive ? "default" : "secondary"}
      size="icon"
      className="flex flex-col gap-1 p-1 border-2"
      title={title}
      aria-label={toolLabel}
      disabled={disabled}
      onClick={onClick}
    >
      <ToolIcon size={14} />
    </Button>
  );
}
