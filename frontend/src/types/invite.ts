export interface InviteInfo {
  boardId: string;
  boardName: string;
  role: "editor" | "viewer";
  expiresAt: string | null;
  valid: boolean;
}
