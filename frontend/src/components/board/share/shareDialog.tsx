import { useState } from "react";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronRight, Share2 } from "lucide-react";
import { toast } from "sonner";
import api, { apiErrorMessage } from "@/lib/api";

type InviteRole = "editor" | "viewer";
type ExpiryPreset = "never" | "1h" | "1d" | "7d" | "30d";

const EXPIRY_MS: Record<Exclude<ExpiryPreset, "never">, number> = {
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export default function ShareDialog({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  const { roomId } = useParams<{ roomId: string }>();
  const [role, setRole] = useState<InviteRole>("editor");
  const [expiry, setExpiry] = useState<ExpiryPreset>("never");
  const [isCreating, setIsCreating] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!roomId) return;
    setIsCreating(true);
    try {
      const expiresAt =
        expiry === "never"
          ? undefined
          : new Date(Date.now() + EXPIRY_MS[expiry]).toISOString();
      const { data } = await api.post<{ token: string }>(
        `/boards/${roomId}/invites`,
        { role, ...(expiresAt ? { expiresAt } : {}) },
      );
      setLink(`${window.location.origin}/invite/${data.token}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to create invite"));
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="flex items-center justify-between w-full p-2 h-8 hover:bg-accent"
          />
        }
      >
        <div className="flex items-center gap-2">
          <Share2 size={12} />
          {!collapsed && <span className="text-xs font-medium">Share</span>}
        </div>
        {!collapsed && <ChevronRight size={10} />}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share board</DialogTitle>
          <DialogDescription>
            Create an invite link for this board. The link is shown only once.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Role</span>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as InviteRole)}
              items={{ editor: "Editor", viewer: "Viewer" }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">
                  Editor
                  <span className="text-muted-foreground">
                    Can view and draw
                  </span>
                </SelectItem>
                <SelectItem value="viewer">
                  Viewer
                  <span className="text-muted-foreground">Can view only</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Expires</span>
            <Select
              value={expiry}
              onValueChange={(value) => setExpiry(value as ExpiryPreset)}
              items={{
                never: "Never",
                "1h": "1 hour",
                "1d": "1 day",
                "7d": "7 days",
                "30d": "30 days",
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">Never</SelectItem>
                <SelectItem value="1h">1 hour</SelectItem>
                <SelectItem value="1d">1 day</SelectItem>
                <SelectItem value="7d">7 days</SelectItem>
                <SelectItem value="30d">30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full" onClick={handleCreate} disabled={isCreating}>
            {isCreating ? "Creating…" : "Create link"}
          </Button>
          {link && (
            <div className="flex flex-col gap-1.5">
              <Input value={link} readOnly />
              <Button variant="outline" onClick={handleCopy}>
                Copy
              </Button>
              <p className="text-xs text-muted-foreground">
                This link is shown once and can't be recovered.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}