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
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="Board actions" />}
      >
        <MoreHorizontal />
        <span className="sr-only">Board actions</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onOpen}>
          <ExternalLink /> Open
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onRename}>
          <Pencil /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate}>
          <Copy /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {status === "active" ? (
          <DropdownMenuItem onClick={onArchive}>
            <Archive /> Archive
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={onRestore}>
            <ArchiveRestore /> Restore
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
