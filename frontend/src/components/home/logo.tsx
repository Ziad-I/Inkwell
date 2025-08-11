import { PenTool } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Logo(props: { size?: number; className?: string }) {
  const { size = 24, className } = props;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="inline-grid place-items-center rounded-md border p-1">
        <PenTool
          className="text-foreground"
          style={{ width: size, height: size }}
        />
      </span>
      <span className="sr-only">Inkwell</span>
    </span>
  );
}
