import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoadingSpinner } from "@/components/home/LoadingSpinner";
import api, { apiErrorMessage } from "@/lib/api";

type InviteInfo = {
  boardId: string;
  role: "editor" | "viewer";
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  revoked: boolean;
  expired: boolean;
};

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [boardName, setBoardName] = useState("this board");
  const [invalidMessage, setInvalidMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadInvite() {
      try {
        const { data } = await api.get<InviteInfo>(`/invites/${token}`);
        if (cancelled) return;
        setInvite(data);
        try {
          const { data: board } = await api.get<{ name?: string }>(
            `/boards/${data.boardId}`,
          );
          if (!cancelled && board.name) setBoardName(board.name);
        } catch {
          // keep the fallback board name
        }
      } catch (err) {
        if (cancelled) return;
        setInvalidMessage(
          apiErrorMessage(
            err,
            "This invitation link is invalid or no longer exists.",
          ),
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadInvite();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleJoin = async () => {
    if (!invite) return;
    setIsSubmitting(true);
    try {
      const { data } = await api.post<{ boardId: string }>("/invites/redeem", {
        token,
      });
      navigate(`/board/${data.boardId}`, { replace: true });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to join board"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (invalidMessage || !invite) {
    return (
      <div className="flex justify-center">
        <Card className="w-full max-w-md border-2">
          <CardHeader>
            <CardTitle className="text-left">Invite not found</CardTitle>
            <CardDescription className="text-left">
              {invalidMessage}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full" size="lg">
              <Link to="/">Go home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invite.revoked) {
    return (
      <div className="flex justify-center">
        <Card className="w-full max-w-md border-2">
          <CardHeader>
            <CardTitle className="text-left">Invitation revoked</CardTitle>
            <CardDescription className="text-left">
              This invitation was revoked by the board owner.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (invite.expired) {
    return (
      <div className="flex justify-center">
        <Card className="w-full max-w-md border-2">
          <CardHeader>
            <CardTitle className="text-left">Invitation expired</CardTitle>
            <CardDescription className="text-left">
              This invitation link has expired.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-md border-2">
        <CardHeader>
          <CardTitle className="text-left">
            You&apos;ve been invited to {boardName}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Badge>{invite.role === "editor" ? "Editor" : "Viewer"}</Badge>
          {invite.expiresAt && (
            <p className="text-xs text-muted-foreground">
              This link expires on{" "}
              {new Date(invite.expiresAt).toLocaleDateString()}
            </p>
          )}
          <Button
            className="w-full"
            size="lg"
            onClick={handleJoin}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Joining…" : "Join board"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}