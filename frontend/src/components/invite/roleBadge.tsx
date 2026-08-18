import { Eye, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Role = "editor" | "viewer";

const ROLE_CONFIG: Record<Role, { label: string; icon: typeof Pencil }> = {
  editor: { label: "Editor", icon: Pencil },
  viewer: { label: "Viewer", icon: Eye },
};

export function RoleBadge({ role }: { role: Role }) {
  const { label, icon: Icon } = ROLE_CONFIG[role];

  return (
    <Badge variant="secondary">
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}
