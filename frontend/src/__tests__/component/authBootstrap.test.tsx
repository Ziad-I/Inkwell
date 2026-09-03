import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { CanceledError } from "axios";

import { useAuthStore } from "@/stores/authStore";
import { deferred, resetAuthStore } from "../helpers/httpClient";

const restoreSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/api", async () => {
  const actual = await vi.importActual<typeof import("@/api")>("@/api");
  return { ...actual, restoreSession: restoreSessionMock };
});

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => navigateMock };
});

async function renderBootstrap(deadlineMs?: number) {
  const { AuthBootstrap } = await import("@/components/auth/authBootstrap");
  return render(
    <AuthBootstrap deadlineMs={deadlineMs}>
      <div>App content</div>
    </AuthBootstrap>,
  );
}

function calledSignal(index: number): AbortSignal {
  return restoreSessionMock.mock.calls[index][0].signal as AbortSignal;
}

describe("AuthBootstrap", () => {
  beforeEach(() => {
    resetAuthStore();
    restoreSessionMock.mockReset();
    navigateMock.mockReset();
  });

  it("renders the restoration status immediately while the restore is pending", async () => {
    restoreSessionMock.mockReturnValue(new Promise(() => undefined));
    await renderBootstrap();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Restoring your session...",
    );
    expect(screen.queryByText("App content")).not.toBeInTheDocument();
    expect(restoreSessionMock).toHaveBeenCalledTimes(1);
    expect(calledSignal(0)).toBeInstanceOf(AbortSignal);
  });

  it("times out after 8 seconds and retries with a fresh signal", async () => {
    vi.useFakeTimers();
    try {
      const firstRestore = deferred<"unauthenticated">();
      restoreSessionMock
        .mockReturnValueOnce(firstRestore.promise)
        .mockResolvedValueOnce("authenticated");
      await renderBootstrap();

      act(() => {
        vi.advanceTimersByTime(7_999);
      });
      expect(screen.getByRole("status")).toHaveTextContent(
        "Restoring your session...",
      );

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(
        screen.getByRole("heading", {
          name: "Session restoration timed out",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Try again" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("App content")).not.toBeInTheDocument();

      // The aborted restore settles after the deadline: the store must
      // record the failed restore, not a committed "unauthenticated".
      await act(async () => {
        firstRestore.resolve("unauthenticated");
      });
      expect(useAuthStore.getState().status).toBe("error");

      fireEvent.click(screen.getByRole("button", { name: "Try again" }));

      expect(restoreSessionMock).toHaveBeenCalledTimes(2);
      expect(calledSignal(1)).not.toBe(calledSignal(0));
      expect(calledSignal(0).aborted).toBe(true);

      await act(async () => {});
      expect(screen.getByText("App content")).toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("honours a custom deadline", async () => {
    vi.useFakeTimers();
    try {
      restoreSessionMock.mockReturnValue(new Promise(() => undefined));
      await renderBootstrap(50);

      act(() => {
        vi.advanceTimersByTime(50);
      });

      expect(
        screen.getByRole("heading", {
          name: "Session restoration timed out",
        }),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces a recoverable error when the restore call rejects", async () => {
    restoreSessionMock
      .mockRejectedValueOnce(new Error("network is down"))
      .mockResolvedValueOnce("authenticated");
    await renderBootstrap();

    expect(
      await screen.findByRole("heading", {
        name: "We couldn't restore your session",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The service is temporarily unavailable. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("App content")).not.toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe("error");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => {
      expect(screen.getByText("App content")).toBeInTheDocument();
    });
    expect(restoreSessionMock).toHaveBeenCalledTimes(2);
  });

  it("suppresses the error surface when the rejection is a cancellation", async () => {
    restoreSessionMock.mockRejectedValue(new CanceledError("canceled"));
    await renderBootstrap();

    await act(async () => {});

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Restoring your session...",
    );
  });

  it("aborts the in-flight restore on unmount without surfacing an error", async () => {
    const { promise, reject } = deferred<"authenticated">();
    restoreSessionMock.mockReturnValue(promise);
    const { unmount } = await renderBootstrap();

    unmount();

    expect(calledSignal(0).aborted).toBe(true);
    await act(async () => {
      reject(new Error("late network failure"));
    });
    // The rejection was handled and suppressed: an unhandled rejection
    // here would fail the run, and no error surface ever rendered.
    expect(document.body.textContent).toBe("");
  });

  it.each(["authenticated", "unauthenticated", "stale"] as const)(
    "renders the app when the restore resolves %s",
    async (result) => {
      restoreSessionMock.mockResolvedValue(result);
      await renderBootstrap();

      await waitFor(() => {
        expect(screen.getByText("App content")).toBeInTheDocument();
      });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    },
  );

  it("does not restart the restore when a logout lands after the app rendered", async () => {
    restoreSessionMock.mockResolvedValue("authenticated");
    await renderBootstrap();
    await waitFor(() => {
      expect(screen.getByText("App content")).toBeInTheDocument();
    });

    act(() => {
      useAuthStore.getState().logoutLocally();
    });

    expect(restoreSessionMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("App content")).toBeInTheDocument();
  });
});

async function renderProtected(initialEntry = "/dashboard") {
  const { ProtectedRoute } = await import("@/components/auth/protectedRoute");
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ProtectedRoute>
        <div>Dashboard content</div>
      </ProtectedRoute>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    resetAuthStore();
    navigateMock.mockReset();
  });

  it("renders its children once authenticated", async () => {
    useAuthStore.setState({ status: "authenticated" });
    await renderProtected();

    expect(screen.getByText("Dashboard content")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("shows the spinner while the session is restoring", async () => {
    useAuthStore.setState({ status: "restoring" });
    await renderProtected();

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard content")).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("redirects to /login when unauthenticated", async () => {
    useAuthStore.setState({ status: "unauthenticated" });
    await renderProtected();

    expect(navigateMock).toHaveBeenCalledWith("/login", { replace: true });
  });

  // Design decision: "restore-error" means we could not determine the
  // auth state. Redirecting to /login is acceptable because signing in
  // is always available to the user from there.
  it("redirects to /login when the restore errored", async () => {
    useAuthStore.setState({ status: "error" });
    await renderProtected();

    expect(navigateMock).toHaveBeenCalledWith("/login", { replace: true });
  });

  it("does not navigate when already on /login", async () => {
    useAuthStore.setState({ status: "unauthenticated" });
    await renderProtected("/login");

    expect(navigateMock).not.toHaveBeenCalled();
  });
});
