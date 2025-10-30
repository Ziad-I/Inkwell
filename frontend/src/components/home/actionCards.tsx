import { useState } from "react";
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

export function ActionCards() {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState("");
  const [_isJoining, _setIsJoining] = useState(false);

  const handleCreateBoard = () => {
    const roomId = Math.random().toString(36).substring(2, 15);
    navigate(`/board/${roomId}`);
  };

  const handleJoinBoard = async () => {};

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
          <Button
            onClick={handleCreateBoard}
            className="w-full group"
            size="lg"
          >
            Create Board
            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
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
            <Button
              type="submit"
              variant="secondary"
              className="w-full"
              disabled={!roomCode.trim() || _isJoining}
            >
              {_isJoining ? "Joining..." : "Join Board"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
