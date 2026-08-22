import {
  Archive,
  ArchiveRestore,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BoardListStatus } from "@/types/boards";

type BoardActionsProps = {
  status: BoardListStatus;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
};

// Radix's DropdownMenu and Dialog/AlertDialog each lock body pointer-events
// while open. If a dialog opens in the same tick the dropdown menu closes
// (e.g. Rename/Delete, triggered from a menu item), their pointer-events
// cleanup can race and leave the whole page unclickable after the dialog is
// later closed. Deferring to the next tick lets the dropdown finish
// unmounting first, so the two never overlap.
// See: https://github.com/radix-ui/primitives/issues/3317
function deferred(action: () => void) {
  return () => {
    setTimeout(action, 0);
  };
}

export default function BoardActions({
  status,
  onOpen,
  onRename,
  onDuplicate,
  onArchive,
  onRestore,
  onDelete,
}: BoardActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal />
          <span className="sr-only">Board actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={deferred(onOpen)}>
          <ExternalLink /> Open
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={deferred(onRename)}>
          <Pencil /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={deferred(onDuplicate)}>
          <Copy /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {status === "active" ? (
          <DropdownMenuItem onSelect={deferred(onArchive)}>
            <Archive /> Archive
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={deferred(onRestore)}>
            <ArchiveRestore /> Restore
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onSelect={deferred(onDelete)}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
