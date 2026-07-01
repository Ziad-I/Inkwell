import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import {
  ArrowRight,
  Circle as CircleIcon,
  Grid3X3,
  Minus,
  Moon,
  Plus,
  Square,
  Sun,
  type LucideIcon,
} from "lucide-react";
import {
  LINE_CAPS,
  PRESET_COLORS,
  SHAPE_KINDS,
  type ShapeKind,
} from "@/lib/constants";
import { useUserStore } from "@/stores/userStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTheme } from "@/hooks/useTheme";

interface WidgetProps {
  title: string;
}

export function ColorSettings({ title }: WidgetProps) {
  const color = useSettingsStore((s) => s.color);
  const setColor = useSettingsStore((s) => s.setColor);

  return (
    <PopoverContent side="right" align="start" className="w-52 p-3">
      <PopoverHeader>
        <PopoverTitle>{title}</PopoverTitle>
      </PopoverHeader>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-4 gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              className={`w-8 h-8 rounded border-2 ${
                color === c ? "border-primary" : "border-muted"
              }`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
              title={c}
            />
          ))}
        </div>

        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-full h-10 rounded border"
        />
      </div>
    </PopoverContent>
  );
}

export function SizeSettings({ title }: WidgetProps) {
  const strokeWidth = useSettingsStore((s) => s.strokeWidth);
  const setStrokeWidth = useSettingsStore((s) => s.setStrokeWidth);

  return (
    <PopoverContent side="right" align="start" className="w-52 p-3">
      <PopoverHeader>
        <PopoverTitle>{title}</PopoverTitle>
      </PopoverHeader>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm">Stroke Width</span>
          <span className="text-sm text-muted-foreground">{strokeWidth}px</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => setStrokeWidth(Math.max(1, strokeWidth - 1))}
          >
            <Minus size={12} />
          </Button>

          <Slider
            value={[strokeWidth]}
            onValueChange={([value]) => setStrokeWidth(value)}
            min={1}
            max={50}
            step={1}
            className="flex-1"
          />

          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => setStrokeWidth(Math.min(50, strokeWidth + 1))}
          >
            <Plus size={12} />
          </Button>
        </div>
      </div>
    </PopoverContent>
  );
}

export function OpacitySettings({ title }: WidgetProps) {
  const opacity = useSettingsStore((s) => s.opacity);
  const setOpacity = useSettingsStore((s) => s.setOpacity);

  return (
    <PopoverContent side="right" align="start" className="w-48 p-3">
      <PopoverHeader>
        <PopoverTitle>{title}</PopoverTitle>
      </PopoverHeader>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm">Opacity</span>
          <span className="text-sm text-muted-foreground">
            {Math.round(opacity * 100)}%
          </span>
        </div>

        <Slider
          value={[opacity * 100]}
          onValueChange={([value]) => setOpacity(value / 100)}
          min={0}
          max={100}
          step={1}
          className="w-full"
        />
      </div>
    </PopoverContent>
  );
}

export function LineCapSettings({ title }: WidgetProps) {
  const lineCap = useSettingsStore((s) => s.lineCap);
  const setLineCap = useSettingsStore((s) => s.setLineCap);

  return (
    <PopoverContent side="right" align="start" className="w-52 p-3">
      <PopoverHeader>
        <PopoverTitle>{title}</PopoverTitle>
      </PopoverHeader>
      <div className="flex flex-col gap-3">
        <div className="flex">
          {LINE_CAPS.map((cap) => (
            <Button
              key={cap}
              size="sm"
              variant={lineCap === cap ? "default" : "outline"}
              className="text-xs h-6 px-3 flex-1"
              onClick={() => setLineCap(cap)}
            >
              {cap}
            </Button>
          ))}
        </div>
      </div>
    </PopoverContent>
  );
}

export function ShapeKindSettings({ title }: WidgetProps) {
  const shapeKind = useSettingsStore((s) => s.shapeKind);
  const setShapeKind = useSettingsStore((s) => s.setShapeKind);

  function getIconForShapeKind(kind: ShapeKind): LucideIcon {
    switch (kind) {
      case "rectangle":
        return Square;
      case "circle":
        return CircleIcon;
      case "line":
        return Minus;
      case "arrow":
        return ArrowRight;
    }
  }

  return (
    <PopoverContent side="right" align="start" className="w-28 p-3">
      <PopoverHeader>
        <PopoverTitle>{title}</PopoverTitle>
      </PopoverHeader>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          {SHAPE_KINDS.map((kind) => {
            const Icon = getIconForShapeKind(kind);
            return (
              <Button
                key={kind}
                size="icon"
                variant={shapeKind === kind ? "default" : "outline"}
                onClick={() => setShapeKind(kind)}
              >
                <Icon size={14} />
              </Button>
            );
          })}
        </div>
      </div>
    </PopoverContent>
  );
}

export function GeneralSettings({ title }: WidgetProps) {
  const showGrid = useSettingsStore((s) => s.showGrid);
  const setShowGrid = useSettingsStore((s) => s.setShowGrid);
  const { theme, setTheme } = useTheme();

  const handleThemeToggle = (checked: boolean) => {
    setTheme(checked ? "dark" : "light");
  };

  return (
    <PopoverContent side="right" align="start" className="w-52 p-3">
      <PopoverHeader>
        <PopoverTitle>{title}</PopoverTitle>
      </PopoverHeader>
      <div className="flex flex-col gap-3">
        {/* Grid Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Grid3X3 size={14} />
            <span className="text-sm">Show Grid</span>
          </div>
          <Switch checked={showGrid} onCheckedChange={setShowGrid} />
        </div>

        {/* Dark Mode Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {theme === "dark" ? <Moon size={14} /> : <Sun size={14} />}
            <span className="text-sm">Dark Mode</span>
          </div>
          <Switch
            checked={theme === "dark"}
            onCheckedChange={handleThemeToggle}
          />
        </div>
      </div>
    </PopoverContent>
  );
}

export function PresenceSettings({ title }: WidgetProps) {
  const userName = useUserStore((s) => s.userName);
  const userColor = useUserStore((s) => s.userColor);
  const userId = useUserStore((s) => s.userId);

  return (
    <PopoverContent side="right" align="start" className="w-52 p-3">
      <PopoverHeader>
        <PopoverTitle>{title}</PopoverTitle>
      </PopoverHeader>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full border-3 border-black"
            style={{ backgroundColor: userColor }}
            title={userColor || "No color set"}
            aria-label="User color"
          />

          <div className="flex flex-col">
            <span
              className="text-sm font-medium"
              title={userName || "Anonymous"}
            >
              {userName}
            </span>
            <span
              title={userId}
              aria-label="User ID"
              className="text-xs text-muted-foreground"
            >
              ID: {userId}
            </span>
          </div>
        </div>
      </div>
    </PopoverContent>
  );
}
