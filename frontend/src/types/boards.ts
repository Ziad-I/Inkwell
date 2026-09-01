export interface BoardSummary {
  id: string;
  title: string;
  ownerId: string;
  defaultRole: "editor" | "viewer";
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export type BoardListStatus = "active" | "archived";
