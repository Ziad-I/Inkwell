import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ColorSettings,
  GeneralSettings,
  LineCapSettings,
  OpacitySettings,
  SizeSettings,
  PresenceSettings,
  ShapeKindSettings,
} from "@/components/board/widgets";
import {
  Blend,
  ChevronRight,
  Palette,
  PercentCircle,
  Settings,
  SlidersHorizontal,
  Square,
  User,
} from "lucide-react";

const settingButtons = [
  { id: "color", icon: Palette, label: "Color", component: ColorSettings },
  {
    id: "shape",
    icon: Square,
    label: "Shape",
    component: ShapeKindSettings,
  },
  {
    id: "size",
    icon: SlidersHorizontal,
    label: "Size",
    component: SizeSettings,
  },
  {
    id: "opacity",
    icon: Blend,
    label: "Opacity",
    component: OpacitySettings,
  },
  {
    id: "lineCap",
    icon: PercentCircle,
    label: "Line Cap",
    component: LineCapSettings,
  },
  {
    id: "general",
    icon: Settings,
    label: "General",
    component: GeneralSettings,
  },
  {
    id: "presence",
    icon: User,
    label: "Presence",
    component: PresenceSettings,
  },
];

interface FloatingWidgetProps {
  compact?: boolean;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

function FloatingWidget({
  compact,
  isOpen,
  onClose,
  children,
}: FloatingWidgetProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop (slightly lower z so it sits behind the panel) */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {/* Panel (higher z so it is always above the toolbar) */}
      <Card
        className={` ${
          compact ? "left-20" : "left-34"
        } fixed z-50 p-3 bg-muted border shadow-lg transform -translate-y-10 `}
      >
        {children}
      </Card>
    </>
  );
}

interface ToolSettingsProps {
  compact?: boolean;
}

export default function ToolSettings({ compact }: ToolSettingsProps) {
  const [openPanel, setOpenPanel] = useState<string | null>(null);

  const handleButtonClick = (buttonId: string) => {
    setOpenPanel(openPanel === buttonId ? null : buttonId);
  };

  return (
    <div className="flex flex-col gap-1 w-full">
      {settingButtons.map(({ id, icon: Icon, label, component: Component }) => (
        <div key={id}>
          {!compact ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleButtonClick(id)}
              className="flex items-center justify-between w-full p-2 h-8 hover:bg-accent"
            >
              <div className="flex items-center gap-2">
                <Icon size={12} />
                <span className="text-xs font-medium">{label}</span>
              </div>
              <ChevronRight size={10} />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleButtonClick(id)}
              title={label}
              aria-label={label}
              className="flex items-center justify-between w-full p-2 h-8 hover:bg-accent"
            >
              <div className="flex items-center gap-2">
                <Icon size={12} />
              </div>
              <ChevronRight size={10} />
            </Button>
          )}

          <FloatingWidget
            compact={compact}
            isOpen={openPanel === id}
            onClose={() => setOpenPanel(null)}
          >
            <Component />
          </FloatingWidget>
        </div>
      ))}
    </div>
  );
}
