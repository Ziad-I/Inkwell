import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Plus, Link2 } from "lucide-react";
import { useNavigate } from "react-router";
import { usePresenceStore } from "@/stores/presenceStore";
import { useAuthStore } from "@/stores/authStore";

import { boardApi, mapHttpError } from "@/api";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

type DrawPermission = "anyone" | "owner";

export function ActionCards() {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState("");
  const [name, setName] = useState("");
  const [drawPermission, setDrawPermission] =
    useState<DrawPermission>("anyone");

  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const setAnonymousName = usePresenceStore((state) => state.setAnonymousName);
  const isAuthenticated = useAuthStore(
    (state) => state.status === "authenticated",
  );

  const handleCreateBoard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreating(true);

    try {
      if (name.trim()) setAnonymousName(name.trim());

      const { id } = await boardApi.create({
        name: name.trim() ? `${name.trim()}'s Board` : "Untitled Board",
        drawPermission: isAuthenticated ? drawPermission : "anyone",
      });

      navigate(`/board/${id}`);
    } catch (err) {
      const mapped = mapHttpError(err, "create-board");
      if (mapped.category !== "cancelled") {
        toast.error(mapped.message);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinBoard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!roomCode.trim()) return;

    setIsJoining(true);

    try {
      if (name.trim()) setAnonymousName(name.trim());

      const id = roomCode.includes("/")
        ? roomCode.split("/").at(-1)!
        : roomCode.trim();

      await boardApi.get(id, { allowAuthRefresh: false });
      navigate(`/board/${id}`);
    } catch (err) {
      console.error(err);
      const mapped = mapHttpError(err, "lookup-board");
      if (mapped.category !== "cancelled") {
        toast.error(mapped.message);
      }
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto mb-16">
      {/* Create Board Card */}
      <Card className="relative overflow-hidden border-2 hover:border-primary/50 transition-all duration-300 hover:shadow-lg">
        <CardHeader className="pb-4">
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-3">
            <Plus className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-left">Start Fresh</CardTitle>
          <CardDescription className="text-left">
            Create a new whiteboard and invite your team
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <form onSubmit={handleCreateBoard} className="space-y-3">
            <Input
              type="text"
              placeholder="(Optional) Your name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full"
            />
            <Select
              onValueChange={(value) =>
                setDrawPermission(value as DrawPermission)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Who can draw?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anyone">Anyone can draw</SelectItem>
                <SelectItem value="owner" disabled={!isAuthenticated}>
                  Only me
                </SelectItem>
              </SelectContent>
            </Select>
            {!isAuthenticated && (
              <p className="text-xs text-muted-foreground">
                Sign in to create boards with draw permissions.
              </p>
            )}
            <Button
              type="submit"
              className="w-full group"
              size="lg"
              disabled={isCreating}
            >
              {isCreating ? "Creating..." : "Create Board"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Join Board Card */}
      <Card className="relative overflow-hidden border-2 hover:border-primary/50 transition-all duration-300 hover:shadow-lg">
        <CardHeader className="pb-4">
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-3">
            <Link2 className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-left">Join Session</CardTitle>
          <CardDescription className="text-left">
            Enter a room code or paste an invitation link
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <form onSubmit={handleJoinBoard} className="space-y-3">
            <Input
              type="text"
              placeholder="(Optional) Your name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full"
            />
            <Input
              type="text"
              placeholder="Room code or board link..."
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              className="w-full"
            />
            <Button
              type="submit"
              variant="secondary"
              className="w-full"
              disabled={!roomCode.trim() || isJoining}
            >
              {isJoining ? "Joining..." : "Join Board"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
