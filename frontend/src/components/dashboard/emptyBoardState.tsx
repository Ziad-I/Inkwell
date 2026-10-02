import { Button } from "@/components/ui/button";
import { LayoutDashboard, Plus } from "lucide-react";
import type { BoardListStatus } from "@/types/boards";

export default function EmptyBoardsState({
  status,
  onCreate,
  isCreating,
}: {
  status: BoardListStatus;
  onCreate: () => void;
  isCreating: boolean;
}) {
  return (
    <div
      className={`mt-4 h-full flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-center`}
    >
      <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
        <LayoutDashboard className="w-6 h-6 text-primary" />
      </div>
      <div>
        <p className="font-medium text-foreground">
          {status === "active" ? "No active boards yet" : "No archived boards"}
        </p>
        <p className="text-sm text-muted-foreground">
          {status === "active"
            ? "Create your first whiteboard to get started."
            : "Boards you archive will show up here."}
        </p>
      </div>
      {status === "active" && (
        <Button onClick={onCreate} disabled={isCreating} size="sm">
          <Plus className="w-4 h-4" />
          {isCreating ? "Creating..." : "New board"}
        </Button>
      )}
    </div>
  );
}
