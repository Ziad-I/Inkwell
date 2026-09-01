/**
 * Stable classifications for HTTP failures.
 *
 * Categories and operations are the shared vocabulary between the error
 * mapper (lib/http/errors.ts), pages, and components. Display copy is
 * derived from (operation, category) pairs, never from backend payloads.
 */
export type HttpErrorCategory =
  | "offline"
  | "timeout"
  | "authentication"
  | "authorization"
  | "validation"
  | "conflict"
  | "rate-limit"
  | "service"
  | "cancelled";

/** Every HTTP operation the app currently performs. */
export type HttpOperation =
  | "login"
  | "register"
  | "restore-session"
  | "refresh-session"
  | "logout"
  | "lookup-invite"
  | "redeem-invite"
  | "create-invite"
  | "lookup-board"
  | "list-boards"
  | "create-board"
  | "rename-board"
  | "duplicate-board"
  | "archive-board"
  | "restore-board"
  | "delete-board";
