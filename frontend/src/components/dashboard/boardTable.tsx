import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BoardListStatus, BoardSummary } from "@/types/boards";
import BoardActions from "@/components/dashboard/boardActions";

type SortColumn = "title" | "createdAt" | "updatedAt";
type SortDirection = "asc" | "desc";
type SortState = { column: SortColumn; direction: SortDirection };

type BoardTableProps = {
  boards: BoardSummary[];
  status: BoardListStatus;
  onOpen: (board: BoardSummary) => void;
  onRename: (board: BoardSummary) => void;
  onDuplicate: (board: BoardSummary) => void;
  onArchive: (board: BoardSummary) => void;
  onRestore: (board: BoardSummary) => void;
  onDelete: (board: BoardSummary) => void;
};

export default function BoardTable({
  boards,
  status,
  onOpen,
  onRename,
  onDuplicate,
  onArchive,
  onRestore,
  onDelete,
}: BoardTableProps) {
  const [sort, setSort] = useState<SortState>({
    column: "updatedAt",
    direction: "desc",
  });

  const sortedBoards = useMemo(() => {
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...boards].sort((a, b) => {
      if (sort.column === "title") {
        return a.title.localeCompare(b.title) * factor;
      }
      return (
        (new Date(a[sort.column]).getTime() -
          new Date(b[sort.column]).getTime()) *
        factor
      );
    });
  }, [boards, sort]);

  const toggleSort = (column: SortColumn) => {
    setSort((prev) => {
      if (prev.column === column) {
        return { column, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      // Names default to A→Z, dates default to newest first.
      return { column, direction: column === "title" ? "asc" : "desc" };
    });
  };

  return (
    <div className={`mt-4 h-full overflow-y-auto rounded-md border`}>
      <Table className="table-fixed">
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <SortableHead
              column="title"
              label="Name"
              className="w-[45%]"
              sort={sort}
              onSort={toggleSort}
            />
            <SortableHead
              column="createdAt"
              label="Created"
              className="w-[22%]"
              sort={sort}
              onSort={toggleSort}
            />
            <SortableHead
              column="updatedAt"
              label="Last updated"
              className="w-[22%]"
              sort={sort}
              onSort={toggleSort}
            />
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>

        <TableBody>
          {sortedBoards.map((board) => (
            <TableRow key={board.id}>
              <TableCell className="max-w-0">
                <button
                  type="button"
                  title={board.title}
                  className="block w-full truncate text-left font-medium hover:underline"
                  onClick={() => onOpen(board)}
                >
                  {board.title}
                </button>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(board.createdAt)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(board.updatedAt)}
              </TableCell>
              <TableCell>
                <BoardActions
                  status={status}
                  onOpen={() => onOpen(board)}
                  onRename={() => onRename(board)}
                  onDuplicate={() => onDuplicate(board)}
                  onArchive={() => onArchive(board)}
                  onRestore={() => onRestore(board)}
                  onDelete={() => onDelete(board)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SortableHead({
  column,
  label,
  className,
  sort,
  onSort,
}: {
  column: SortColumn;
  label: string;
  className?: string;
  sort: SortState;
  onSort: (column: SortColumn) => void;
}) {
  const isActive = sort.column === column;
  const Icon = !isActive
    ? ArrowUpDown
    : sort.direction === "asc"
      ? ArrowUp
      : ArrowDown;

  return (
    <TableHead
      className={className}
      aria-sort={
        isActive
          ? sort.direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          isActive ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon className="h-3.5 w-3.5" />
      </button>
    </TableHead>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}
