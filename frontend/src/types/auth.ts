export interface AuthUser {
  id: string;
  username: string;
  email: string;
}

export type AuthStatus =
  | "idle"
  | "loading"
  | "authenticated"
  | "unauthenticated";
