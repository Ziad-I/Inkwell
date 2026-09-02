export interface AuthUser {
  id: string;
  username: string;
  email: string;
}

export type AuthStatus =
  | "idle"
  | "restoring"
  | "authenticated"
  | "unauthenticated"
  | "error";
