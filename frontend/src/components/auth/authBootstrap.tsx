import { useEffect, useState, type ReactNode } from "react";

import { restoreSession } from "@/api";
import { isCancelledHttpError, mapHttpError } from "@/api";
import { useAuthStore } from "@/stores/authStore";
import { LoadingSpinner } from "@/components/home/LoadingSpinner";
import { Button } from "@/components/ui/button";

const BOOTSTRAP_DEADLINE_MS = 8_000;

interface AuthBootstrapProps {
  children: ReactNode;
  deadlineMs?: number;
}

type Phase = "pending" | "ready" | "error" | "timeout";

/**
 * Runs the session restore INSIDE React so the app mounts immediately.
 *
 * main.tsx renders the tree synchronously; this component calls
 * restoreSession once per mount (plus once per retry) and gates the app
 * behind it. The effect re-runs only when `attempt` changes — a logout
 * after a successful restore never re-triggers it, so the guest app
 * renders without a restoring flicker.
 */
export function AuthBootstrap({
  children,
  deadlineMs = BOOTSTRAP_DEADLINE_MS,
}: AuthBootstrapProps) {
  const [phase, setPhase] = useState<Phase>("pending");
  const [attempt, setAttempt] = useState(0);
  const [errorDetail, setErrorDetail] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const epoch = useAuthStore.getState().captureEpoch();
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      setPhase("timeout");
    }, deadlineMs);

    restoreSession({ signal: controller.signal }).then(
      () => {
        if (timedOut) {
          // The deadline fired first. The abort may have landed inside
          // the refresh path as a committed "unauthenticated"; re-mark
          // the store so it reflects that the restore never finished.
          useAuthStore.getState().failRestore(epoch);
          return;
        }
        if (controller.signal.aborted) {
          // Unmounted mid-flight: the store already holds whatever
          // landed, and no surface should replace the unmounted one.
          return;
        }
        // "authenticated", "unauthenticated", and "stale" all mean the
        // store now holds the truth — for "stale", a newer login or
        // logout won the race. A resolved "unauthenticated" is a valid
        // guest session, not an error.
        setPhase("ready");
      },
      (error: unknown) => {
        if (
          timedOut ||
          controller.signal.aborted ||
          isCancelledHttpError(error)
        ) {
          return;
        }
        const mapped = mapHttpError(error, "restore-session");
        useAuthStore.getState().failRestore(epoch);
        setErrorDetail(mapped.message);
        setPhase("error");
      },
    );

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [attempt, deadlineMs]);

  const retry = () => {
    setErrorDetail("");
    setPhase("pending");
    setAttempt((current) => current + 1);
  };

  if (phase === "pending") {
    return (
      <div role="status" aria-live="polite">
        <LoadingSpinner label="Restoring your session..." />
      </div>
    );
  }

  if (phase === "timeout" || phase === "error") {
    const heading =
      phase === "timeout"
        ? "Session restoration timed out"
        : "We couldn't restore your session";
    return (
      <div
        role="alert"
        className="flex h-screen w-screen items-center justify-center"
      >
        <div className="flex max-w-md flex-col items-center gap-4 px-6 text-center">
          <h1 className="text-foreground text-lg font-semibold">{heading}</h1>
          {errorDetail ? (
            <p className="text-muted-foreground text-sm">{errorDetail}</p>
          ) : null}
          <Button type="button" onClick={retry}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return children;
}
