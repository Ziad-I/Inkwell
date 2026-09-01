import { AxiosError, CanceledError, isCancel } from "axios";

import type { HttpErrorCategory, HttpOperation } from "@/types/http";

/**
 * A fully redacted description of an HTTP failure: everything needed for
 * UI decisions and display, with no backend-controlled text.
 */
export interface SafeHttpError {
  category: HttpErrorCategory;
  operation: HttpOperation;
  status: number | null;
  message: string;
}

/** Category-stable copy used when no operation-specific message applies. */
const CATEGORY_MESSAGES: Record<HttpErrorCategory, string> = {
  offline: "You appear to be offline. Check your connection and try again.",
  timeout: "The request timed out. Please try again.",
  authentication: "Your session has expired. Please sign in again.",
  authorization: "You do not have permission to perform this action.",
  validation: "The request was invalid. Please check your input and try again.",
  conflict:
    "Your changes conflict with the current state. Please refresh and try again.",
  "rate-limit": "Too many requests. Please wait a moment and try again.",
  service: "The service is temporarily unavailable. Please try again.",
  cancelled: "",
};

/**
 * Stable copy for (operation, category) pairs whose failure cause deserves
 * more specific wording than the category-stable fallback.
 */
const OPERATION_MESSAGES: Partial<
  Record<HttpOperation, Partial<Record<HttpErrorCategory, string>>>
> = {
  login: {
    authentication: "Invalid email or password.",
  },
  register: {
    conflict: "An account with this email or username already exists.",
  },
  "restore-session": {
    timeout: "Your session restore timed out. Please refresh the page.",
  },
  "lookup-invite": {
    validation: "This invitation link is invalid or no longer exists.",
  },
  "redeem-invite": {
    validation:
      "This invitation link is no longer redeemable. Ask the board owner for a new link.",
  },
  "create-invite": {
    authorization: "Only the board owner can create invitation links.",
  },
  "lookup-board": {
    authorization: "You do not have access to this board.",
  },
};

/**
 * True when the error represents a deliberately cancelled request.
 * Callers use this to suppress toasts for cancellations.
 */
export function isCancelledHttpError(error: unknown): boolean {
  return (
    isCancel(error) ||
    error instanceof CanceledError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === "ERR_CANCELED")
  );
}

/**
 * REDACTION CONTRACT: this classifier inspects ONLY error.code,
 * response.status, and the presence of a response. It never reads
 * response bodies, error messages, or request config, and never returns
 * the raw error.
 */
function classify(error: unknown): {
  category: HttpErrorCategory;
  status: number | null;
} {
  if (isCancelledHttpError(error)) {
    return { category: "cancelled", status: null };
  }
  if (error instanceof AxiosError) {
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return { category: "timeout", status: null };
    }
    if (!error.response) {
      return { category: "offline", status: null };
    }
    switch (error.response.status) {
      case 400:
      case 422:
        return { category: "validation", status: error.response.status };
      case 401:
        return { category: "authentication", status: error.response.status };
      case 403:
        return { category: "authorization", status: error.response.status };
      case 409:
        return { category: "conflict", status: error.response.status };
      case 429:
        return { category: "rate-limit", status: error.response.status };
      default:
        return { category: "service", status: error.response.status };
    }
  }
  return { category: "service", status: null };
}

/**
 * Maps any caught error to a redacted SafeHttpError for the given
 * operation. The message is always frontend-authored stable copy:
 * operation-specific when listed, category-stable otherwise. Cancellation
 * maps to an empty message.
 */
export function mapHttpError(
  error: unknown,
  operation: HttpOperation,
): SafeHttpError {
  const { category, status } = classify(error);
  const message =
    OPERATION_MESSAGES[operation]?.[category] ?? CATEGORY_MESSAGES[category];
  return { category, operation, status, message };
}

/**
 * Returns the operation-specific stable message for a listed
 * (operation, category) pair, or null when the pair is unlisted.
 *
 * Interim: consumed by apiErrorMessage in lib/api.ts so it can prefer the
 * caller's fallback for unlisted pairs. Remove alongside that wrapper once
 * callers migrate to mapHttpError directly.
 */
export function operationMessage(
  operation: HttpOperation,
  category: HttpErrorCategory,
): string | null {
  return OPERATION_MESSAGES[operation]?.[category] ?? null;
}
