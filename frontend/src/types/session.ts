export type SessionStatus = {
  status: Status;
  error?: string;
};

export type Status =
  | "idle"
  | "connecting"
  | "joining"
  | "syncing"
  | "ready"
  | "error";
