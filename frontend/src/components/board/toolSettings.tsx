import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ColorSettings,
  GeneralSettings,
  LineCapSettings,
  OpacitySettings,
  SizeSettings,
} from "@/components/board/widgets";
import {
  Blend,
  ChevronRight,
  Palette,
  PercentCircle,
  Settings,
  SlidersHorizontal,
} from "lucide-react";

const settingButtons = [
  { id: "color", icon: Palette, label: "Color", component: ColorSettings },
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
];

interface FloatingWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

function FloatingWidget({ isOpen, onClose, children }: FloatingWidgetProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-20" onClick={onClose} />
      {/* Panel */}
      <Card className="fixed left-32 z-30 p-3  bg-muted border shadow-lg">
        {children}
      </Card>
    </>
  );
}

export default function ToolSettings() {
  const [openPanel, setOpenPanel] = useState<string | null>(null);

  const handleButtonClick = (buttonId: string) => {
    setOpenPanel(openPanel === buttonId ? null : buttonId);
  };

  return (
    <div className="flex flex-col gap-1 w-full">
      {settingButtons.map(({ id, icon: Icon, label, component: Component }) => (
        <div key={id}>
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

          <FloatingWidget
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
