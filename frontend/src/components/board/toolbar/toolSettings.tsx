import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { useSessionStore } from "@/stores/sessionStore";
import ShareDialog from "@/components/board/share/shareDialog";
import {
  ColorSettings,
  GeneralSettings,
  LineCapSettings,
  OpacitySettings,
  SizeSettings,
  PresenceSettings,
  ShapeKindSettings,
} from "@/components/board/toolbar/widgets";
import {
  Blend,
  ChevronLeft,
  ChevronRight,
  Palette,
  PercentCircle,
  Settings,
  SlidersHorizontal,
  Square,
  User,
} from "lucide-react";

const settingButtons = [
  {
    id: "color",
    icon: Palette,
    label: "Color",
    title: "Color Settings",
    component: ColorSettings,
  },
  {
    id: "shape",
    icon: Square,
    label: "Shape",
    title: "Shapes",
    component: ShapeKindSettings,
  },
  {
    id: "size",
    icon: SlidersHorizontal,
    label: "Size",
    title: "Size Settings",
    component: SizeSettings,
  },
  {
    id: "opacity",
    icon: Blend,
    label: "Opacity",
    title: "Opacity Settings",
    component: OpacitySettings,
  },
  {
    id: "lineCap",
    icon: PercentCircle,
    label: "Line Cap",
    title: "Line Cap Settings",
    component: LineCapSettings,
  },
  {
    id: "general",
    icon: Settings,
    label: "General",
    title: "General Settings",
    component: GeneralSettings,
  },
  {
    id: "presence",
    icon: User,
    label: "Presence",
    title: "Presence Info",
    component: PresenceSettings,
  },
];

export default function ToolSettings() {
  const [collapsed, setCollapsed] = useState(false);
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const sessionStatus = useSessionStore((state) => state.sessionStatus);
  const showShare =
    sessionStatus.status === "ready" && sessionStatus.role === "owner";

  return (
    <>
      {openPanel && <div className="fixed inset-0 z-25" />}
      <Card className="fixed top-1/2 left-4 transform -translate-y-1/2 z-30 p-2 bg-muted">
        <div className="flex flex-col items-center gap-2">
          <Button
            aria-label={collapsed ? "Expand settings" : "Collapse settings"}
            variant="outline"
            size="icon"
            onClick={() => setCollapsed((s) => !s)}
            className="rounded-full"
          >
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </Button>

          <Separator orientation="horizontal" />

          <div className="flex flex-col gap-1 w-full">
            {settingButtons.map(
              ({ id, icon: Icon, label, title, component: Component }) => (
                <Popover
                  key={id}
                  open={openPanel === id}
                  onOpenChange={(open) => setOpenPanel(open ? id : null)}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex items-center justify-between w-full p-2 h-8 hover:bg-accent"
                    >
                      <div className="flex items-center gap-2">
                        <Icon size={12} />
                        {!collapsed && (
                          <span className="text-xs font-medium">{label}</span>
                        )}
                      </div>
                      <ChevronRight size={10} />
                    </Button>
                  </PopoverTrigger>
                  <Component title={title} />
                </Popover>
              ),
            )}
          </div>
          <Separator orientation="horizontal" />
          {showShare && <ShareDialog collapsed={collapsed} />}
        </div>
      </Card>
    </>
  );
}
