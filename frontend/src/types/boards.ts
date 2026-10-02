export interface BoardSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export type BoardListStatus = "active" | "archived";
