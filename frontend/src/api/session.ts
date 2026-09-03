import type { z } from "zod";
import { apiClient, AUTH_ENDPOINTS } from "@/api/client";
import { authSessionResponseSchema } from "@/api/schemas";
import { useAuthStore } from "@/stores/authStore";

export const AUTH_DEADLINE_MS = 8_000;

export type AuthSession = z.infer<typeof authSessionResponseSchema>;

export type RefreshOutcome =
  | {
      status: "authenticated";
      session: AuthSession;
    }
  | {
      status: "unauthenticated";
    }
  | {
      status: "stale";
    };

let refreshInFlight: {
  epoch: number;
  promise: Promise<RefreshOutcome>;
} | null = null;

export function refreshSession(options?: {
  signal?: AbortSignal;
}): Promise<RefreshOutcome> {
  const epoch = useAuthStore.getState().captureEpoch();

  if (refreshInFlight?.epoch === epoch) {
    return refreshInFlight.promise;
  }

  const promise = runRefresh(epoch, options).finally(() => {
    if (refreshInFlight?.promise === promise) {
      refreshInFlight = null;
    }
  });

  refreshInFlight = {
    epoch,
    promise,
  };

  return promise;
}

async function runRefresh(
  epoch: number,
  options?: {
    signal?: AbortSignal;
  },
): Promise<RefreshOutcome> {
  try {
    const { data } = await apiClient.post(AUTH_ENDPOINTS.REFRESH, null, {
      signal: authDeadlineSignal(options?.signal),
    });

    const session = authSessionResponseSchema.parse(data);

    const committed = useAuthStore.getState().commitSession(epoch, session);

    if (!committed) {
      return {
        status: "stale",
      };
    }

    return {
      status: "authenticated",
      session,
    };
  } catch {
    const committed = useAuthStore.getState().commitUnauthenticated(epoch);

    if (!committed) {
      return {
        status: "stale",
      };
    }

    return {
      status: "unauthenticated",
    };
  }
}

/**
 * Combines abort signals into one that fires when the first source fires.
 *
 * Prefers the native AbortSignal.any and falls back to a manual
 * combination for runtimes that predate it. The fallback matters because
 * a missing static would throw a TypeError inside the refresh path whose
 * catch swallows it — silently turning every session restore on an older
 * browser into a permanent "unauthenticated" dead end.
 */
export function combineAbortSignals(
  signals: readonly AbortSignal[],
): AbortSignal {
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([...signals]);
  }

  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
  }
  for (const signal of signals) {
    signal.addEventListener("abort", () => controller.abort(signal.reason), {
      once: true,
    });
  }
  return controller.signal;
}

function authDeadlineSignal(signal: AbortSignal | undefined): AbortSignal {
  const deadline = AbortSignal.timeout(AUTH_DEADLINE_MS);

  return signal ? combineAbortSignals([signal, deadline]) : deadline;
}
