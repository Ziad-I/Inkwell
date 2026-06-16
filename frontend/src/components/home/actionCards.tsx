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
import { useUserStore } from "@/stores/userStore";

import api from "@/lib/api";
import { toast } from "sonner";

export function ActionCards() {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState("");
  const [name, setName] = useState("");

  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const setUserName = useUserStore((state) => state.setUserName);

  const handleCreateBoard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreating(true);

    try {
      if (name.trim()) setUserName(name.trim());

      const { data } = await api.post("/boards", {
        name: name.trim() ? `${name.trim()}'s Board` : "Untitled Board",
      });

      navigate(`/board/${data.id}`, { state: { skipValidation: true } });
    } catch {
      toast.error("Failed to create board. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinBoard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!roomCode.trim()) return;

    setIsJoining(true);

    try {
      if (name.trim()) setUserName(name.trim());

      const id = roomCode.includes("/")
        ? roomCode.split("/").at(-1)!
        : roomCode.trim();

      await api.get(`/boards/${id}`);
      navigate(`/board/${id}`, { state: { skipValidation: true } });
    } catch (err) {
      console.error(err);
      toast.error(
        "Failed to join board. Please check the room code and try again.",
      );
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
              placeholder="Room code or board link..."
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              className="w-full"
            />
            <Input
              type="text"
              placeholder="(Optional) Your name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
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
