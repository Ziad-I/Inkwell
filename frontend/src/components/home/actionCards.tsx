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
import { ArrowRight, Plus, Link2 } from "lucide-react";
import { useNavigate } from "react-router";
import { useUserStore } from "@/stores/userStore";

import api from "@/lib/api";

export function ActionCards() {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setUserName = useUserStore((state) => state.setUserName);

  const handleCreateBoard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (name.trim()) {
        setUserName(name.trim());
      }

      const boardName = name.trim()
        ? `${name.trim()}'s Board`
        : "Untitled Board";

      const { data } = await api.post("/boards", {
        name: boardName,
      });

      navigate(`/board/${data.id}`);
    } catch (err) {
      setError("Failed to create board. Please try again.");
      console.error("Create Board Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinBoard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!roomCode.trim()) return;

    setError(null);
    setLoading(true);

    try {
      if (name.trim()) {
        setUserName(name.trim());
      }

      const id = roomCode.includes("/")
        ? roomCode.split("/").at(-1)!
        : roomCode.trim();

      navigate(`/board/${id}`);
    } catch (err) {
      setError("Failed to join board.");
      console.error("Join Board Error:", err);
    } finally {
      setLoading(false); // ← was missing
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
              disabled={loading}
            >
              Create Board
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
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
              disabled={!roomCode.trim() || loading}
            >
              {loading ? "Joining..." : "Join Board"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
