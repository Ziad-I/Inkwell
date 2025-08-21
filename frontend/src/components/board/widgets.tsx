import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Grid3X3, Minus, Moon, Plus, Sun } from "lucide-react";
import { LINE_CAPS, PRESET_COLORS } from "@/lib/constants";
import { useSettingsStore } from "@/stores/settingsStore";

export function ColorSettings() {
  const color = useSettingsStore((s) => s.color);
  const setColor = useSettingsStore((s) => s.setColor);

  return (
    <div className="flex flex-col gap-3 w-[200px]">
      <h3 className="text-sm font-medium">Color Settings</h3>
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
  );
}

export function SizeSettings() {
  const strokeWidth = useSettingsStore((s) => s.strokeWidth);
  const setStrokeWidth = useSettingsStore((s) => s.setStrokeWidth);

  return (
    <div className="flex flex-col gap-3 w-[200px]">
      <h3 className="text-sm font-medium">Size Settings</h3>
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
  );
}

export function OpacitySettings() {
  const opacity = useSettingsStore((s) => s.opacity);
  const setOpacity = useSettingsStore((s) => s.setOpacity);

  return (
    <div className="flex flex-col gap-3 w-[200px]">
      <h3 className="text-sm font-medium">Opacity Settings</h3>
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
  );
}

export function LineCapSettings() {
  const lineCap = useSettingsStore((s) => s.lineCap);
  const setLineCap = useSettingsStore((s) => s.setLineCap);

  return (
    <div className="flex flex-col gap-3 w-[200px]">
      <h3 className="text-sm font-medium">Line Cap Settings</h3>
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
  );
}

export function GeneralSettings() {
  const showGrid = useSettingsStore((s) => s.showGrid);
  const setShowGrid = useSettingsStore((s) => s.setShowGrid);
  const darkMode = useSettingsStore((s) => s.darkMode);
  const setDarkMode = useSettingsStore((s) => s.setDarkMode);

  return (
    <div className="flex flex-col gap-3 w-[200px]">
      <h3 className="text-sm font-medium">General Settings</h3>

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
          {darkMode ? <Moon size={14} /> : <Sun size={14} />}
          <span className="text-sm">Dark Mode</span>
        </div>
        <Switch checked={darkMode} onCheckedChange={setDarkMode} />
      </div>
    </div>
  );
}
