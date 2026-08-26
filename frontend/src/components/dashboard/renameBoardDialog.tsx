import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type RenameBoardDialogProps = {
  open: boolean;
  title: string;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (title: string) => void;
};

export default function RenameBoardDialog({
  open,
  title,
  isSaving,
  onOpenChange,
  onSubmit,
}: RenameBoardDialogProps) {
  const [value, setValue] = useState(title);

  useEffect(() => {
    if (open) setValue(title);
  }, [open, title]);

  const trimmed = value.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename board</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!trimmed || trimmed === title) {
              onOpenChange(false);
              return;
            }
            onSubmit(trimmed);
          }}
          className="space-y-4"
        >
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Board name"
            autoFocus
            disabled={isSaving}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSaving || !trimmed || trimmed === title}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
