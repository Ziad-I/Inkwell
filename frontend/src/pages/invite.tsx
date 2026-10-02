import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoadingSpinner } from "@/components/home/LoadingSpinner";
import { RoleBadge } from "@/components/invite/roleBadge";
import { InviteStatusCard } from "@/components/invite/inviteStatusCard";
import api, { apiErrorMessage } from "@/lib/api";
import { CalendarClock, PenSquare, ShieldX } from "lucide-react";

type InviteInfo = {
  boardId: string;
  boardName: string;
  role: "editor" | "viewer";
  expiresAt: string | null;
  valid: boolean;
};

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return "This invite never expires";

  const date = new Date(expiresAt);
  if (date.getTime() <= Date.now()) return "This invite has expired";

  return `Expires ${date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  })}`;
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
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
      <InviteStatusCard
        icon={ShieldX}
        title="Invite not found"
        description={
          invalidMessage ??
          "This invitation link is invalid or no longer exists."
        }
      />
    );
  }

  if (!invite.valid) {
    return (
      <InviteStatusCard
        icon={CalendarClock}
        title="Invite no longer valid"
        description={
          invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now()
            ? "This invitation has expired. Ask the board owner for a new link."
            : "This invitation has been revoked or has reached its use limit."
        }
        variant="muted"
      />
    );
  }

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-md border-2">
        <CardHeader className="text-center">
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
            <PenSquare className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-center">
            You&apos;ve been invited to collaborate
          </CardTitle>
          <CardDescription className="text-center">
            Join{" "}
            <span className="font-medium text-foreground">
              {invite.boardName}
            </span>{" "}
            on Inkwell
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
            <span className="text-sm text-muted-foreground">Your role</span>
            <RoleBadge role={invite.role} />
          </div>
          <Separator />
          <p className="text-sm text-muted-foreground text-center">
            {formatExpiry(invite.expiresAt)}
          </p>
        </CardContent>
        <CardFooter className="flex-col gap-3">
          <Button
            className="w-full"
            size="lg"
            onClick={handleJoin}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Joining..." : "Join board"}
          </Button>
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:underline"
          >
            Maybe later
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
