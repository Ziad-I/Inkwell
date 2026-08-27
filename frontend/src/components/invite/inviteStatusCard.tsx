import { Link } from "react-router";
import { ButtonLink } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Home, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function InviteStatusCard({
  icon: Icon,
  title,
  description,
  variant = "destructive",
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  variant?: "destructive" | "muted";
}) {
  return (
    <Card className="mx-auto w-full max-w-md border-2">
      <CardHeader className="text-center">
        <div
          className={cn(
            "w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4",
            variant === "destructive"
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="w-6 h-6" />
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="text-center">
        <ButtonLink className="w-full" render={<Link to="/" />}>
          <Home className="w-4 h-4 mr-2" />
          Back to Home
        </ButtonLink>
      </CardContent>
    </Card>
  );
}
