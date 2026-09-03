import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { boardApi, mapHttpError } from "@/api";
import type { BoardListStatus, BoardSummary } from "@/types/boards";

import BoardTable from "@/components/dashboard/boardTable";
import BoardTableSkeleton from "@/components/dashboard/boardTableSkeleton";
import DeleteBoardDialog from "@/components/dashboard/deleteBoardDialog";
import EmptyBoardsState from "@/components/dashboard/emptyBoardState";
import RenameBoardDialog from "@/components/dashboard/renameBoardDialog";

// Only show the skeleton if a fetch takes longer than this. Fast responses
// (the common case when just switching tabs) never trigger it, so the table
// swaps straight from old data to new data with no in-between flash.
const SKELETON_DELAY_MS = 200;

export default function DashboardPage() {
  const navigate = useNavigate();

  const [status, setStatus] = useState<BoardListStatus>("active");
  const [isLoading, setIsLoading] = useState(false);
  // Whether the skeleton delay has elapsed for the current fetch. Skeleton
  // visibility is derived (isLoading && delayElapsed) so that finishing a
  // load is a single batched state update with no trailing follow-ups.
  const [skeletonDelayElapsed, setSkeletonDelayElapsed] = useState(false);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const [selectedBoard, setSelectedBoard] = useState<BoardSummary | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchBoards = useCallback(async () => {
    setIsLoading(true);
    setSkeletonDelayElapsed(false);
    try {
      const { boards: boardList } = await boardApi.list({ status });
      setBoards(boardList);
    } catch (err) {
      const mapped = mapHttpError(err, "list-boards");
      if (mapped.category !== "cancelled") {
        toast.error(mapped.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void fetchBoards();
  }, [fetchBoards]);

  useEffect(() => {
    if (!isLoading) return;
    const timeoutId = window.setTimeout(
      () => setSkeletonDelayElapsed(true),
      SKELETON_DELAY_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [isLoading]);

  const showSkeleton = isLoading && skeletonDelayElapsed;

  const handleCreateBoard = async () => {
    setIsCreating(true);
    try {
      const { id } = await boardApi.create({ name: "Untitled Board" });
      navigate(`/board/${id}`, { state: { skipValidation: true } });
    } catch (err) {
      const mapped = mapHttpError(err, "create-board");
      if (mapped.category !== "cancelled") {
        toast.error(mapped.message);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleRename = async (title: string) => {
    if (!selectedBoard) return;
    setIsRenaming(true);
    try {
      await boardApi.rename(selectedBoard.id, title);
      toast.success(`Board “${selectedBoard.title}” renamed to “${title}”`);
      setRenameOpen(false);
      setSelectedBoard(null);
      await fetchBoards();
    } catch (err) {
      const mapped = mapHttpError(err, "rename-board");
      if (mapped.category !== "cancelled") {
        toast.error(mapped.message);
      }
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDuplicate = async (board: BoardSummary) => {
    try {
      await boardApi.duplicate(board.id);
      toast.success(`Board “${board.title}” duplicated`);
      await fetchBoards();
    } catch (err) {
      const mapped = mapHttpError(err, "duplicate-board");
      if (mapped.category !== "cancelled") {
        toast.error(mapped.message);
      }
    }
  };

  const handleArchive = async (board: BoardSummary) => {
    try {
      await boardApi.archive(board.id);
      toast.success(`Board “${board.title}” archived`);
      await fetchBoards();
    } catch (err) {
      const mapped = mapHttpError(err, "archive-board");
      if (mapped.category !== "cancelled") {
        toast.error(mapped.message);
      }
    }
  };

  const handleRestore = async (board: BoardSummary) => {
    try {
      await boardApi.restore(board.id);
      toast.success(`Board “${board.title}” restored`);
      await fetchBoards();
    } catch (err) {
      const mapped = mapHttpError(err, "restore-board");
      if (mapped.category !== "cancelled") {
        toast.error(mapped.message);
      }
    }
  };

  const handleDelete = async () => {
    if (!selectedBoard) return;
    setIsDeleting(true);
    try {
      await boardApi.delete(selectedBoard.id);
      toast.success(`Board “${selectedBoard.title}” deleted`);
      setDeleteOpen(false);
      setSelectedBoard(null);
      await fetchBoards();
    } catch (err) {
      const mapped = mapHttpError(err, "delete-board");
      if (mapped.category !== "cancelled") {
        toast.error(mapped.message);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const openRename = (board: BoardSummary) => {
    setSelectedBoard(board);
    setRenameOpen(true);
  };

  const openDelete = (board: BoardSummary) => {
    setSelectedBoard(board);
    setDeleteOpen(true);
  };

  return (
    <div className="mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your boards</h1>
          <p className="text-muted-foreground">
            Create and manage your collaborative boards.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Refresh boards"
            onClick={() => void fetchBoards()}
            disabled={isLoading}
          >
            <RefreshCw />
            <span className="sr-only">Refresh boards</span>
          </Button>
          <Button onClick={handleCreateBoard} disabled={isCreating}>
            <Plus />
            New board
          </Button>
        </div>
      </div>

      <Tabs
        value={status}
        onValueChange={(value) => setStatus(value as BoardListStatus)}
      >
        <TabsList>
          <TabsTrigger
            value="active"
            className={cn(
              status === "active" && "bg-background text-foreground shadow-sm",
            )}
          >
            Active
          </TabsTrigger>
          <TabsTrigger
            value="archived"
            className={cn(
              status === "archived" &&
                "bg-background text-foreground shadow-sm",
            )}
          >
            Archived
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex h-80 flex-col ">
        {showSkeleton ? (
          <BoardTableSkeleton />
        ) : !isLoading && boards.length === 0 ? (
          <EmptyBoardsState
            status={status}
            onCreate={handleCreateBoard}
            isCreating={isCreating}
          />
        ) : (
          <BoardTable
            boards={boards}
            status={status}
            onOpen={(board) => navigate(`/board/${board.id}`)}
            onRename={openRename}
            onDuplicate={handleDuplicate}
            onArchive={handleArchive}
            onRestore={handleRestore}
            onDelete={openDelete}
          />
        )}
      </div>

      <RenameBoardDialog
        open={renameOpen}
        title={selectedBoard?.title ?? ""}
        isSaving={isRenaming}
        onOpenChange={(open) => {
          setRenameOpen(open);
          if (!open) setSelectedBoard(null);
        }}
        onSubmit={handleRename}
      />

      <DeleteBoardDialog
        open={deleteOpen}
        boardTitle={selectedBoard?.title ?? ""}
        isDeleting={isDeleting}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setSelectedBoard(null);
        }}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
