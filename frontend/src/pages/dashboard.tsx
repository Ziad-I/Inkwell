import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import api, { apiErrorMessage } from "@/lib/api";
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
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const [selectedBoard, setSelectedBoard] = useState<BoardSummary | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchBoards = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get<{ boards: BoardSummary[] }>("/boards", {
        params: { status },
      });
      setBoards(data.boards);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to load your boards"));
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void fetchBoards();
  }, [fetchBoards]);

  useEffect(() => {
    if (!isLoading) {
      setShowSkeleton(false);
      return;
    }
    const timeoutId = window.setTimeout(
      () => setShowSkeleton(true),
      SKELETON_DELAY_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [isLoading]);

  const handleCreateBoard = async () => {
    setIsCreating(true);
    try {
      const { data } = await api.post<{ id: string }>("/boards", {
        name: "Untitled Board",
      });
      navigate(`/board/${data.id}`, { state: { skipValidation: true } });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to create board"));
    } finally {
      setIsCreating(false);
    }
  };

  const handleRename = async (title: string) => {
    if (!selectedBoard) return;
    setIsRenaming(true);
    try {
      await api.patch(`/boards/${selectedBoard.id}`, { title });
      toast.success(`Board “${selectedBoard.title}” renamed to “${title}”`);
      setRenameOpen(false);
      setSelectedBoard(null);
      await fetchBoards();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to rename board"));
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDuplicate = async (board: BoardSummary) => {
    try {
      await api.post(`/boards/${board.id}/duplicate`);
      toast.success(`Board “${board.title}” duplicated`);
      await fetchBoards();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to duplicate board"));
    }
  };

  const handleArchive = async (board: BoardSummary) => {
    try {
      await api.patch(`/boards/${board.id}/archive`);
      toast.success(`Board “${board.title}” archived`);
      await fetchBoards();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to archive board"));
    }
  };

  const handleRestore = async (board: BoardSummary) => {
    try {
      await api.patch(`/boards/${board.id}/restore`);
      toast.success(`Board “${board.title}” restored`);
      await fetchBoards();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to restore board"));
    }
  };

  const handleDelete = async () => {
    if (!selectedBoard) return;
    setIsDeleting(true);
    try {
      await api.delete(`/boards/${selectedBoard.id}`);
      toast.success(`Board “${selectedBoard.title}” deleted`);
      setDeleteOpen(false);
      setSelectedBoard(null);
      await fetchBoards();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to delete board"));
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

        <Button onClick={handleCreateBoard} disabled={isCreating}>
          <Plus />
          New board
        </Button>
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
