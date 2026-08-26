import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor, render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { AxiosError } from "axios";

const apiMock = vi.hoisted(() => ({
  default: { get: vi.fn(), post: vi.fn() },
  apiErrorMessage: (err: unknown, fallback: string) => {
    if (err instanceof AxiosError) {
      const message = (err.response?.data as { message?: string } | undefined)
        ?.message;
      if (message) return message;
    }
    return fallback;
  },
}));

const toastMock = vi.hoisted(() => ({ toast: { error: vi.fn() } }));

vi.mock("@/lib/api", () => apiMock);
vi.mock("sonner", () => toastMock);

const navigateMock = vi.hoisted(() => vi.fn());
const paramsMock = vi.hoisted(() => ({ token: "tok1" }));
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => paramsMock,
  };
});

const validInvite = {
  boardId: "b1",
  boardName: "Team Board",
  role: "editor" as const,
  expiresAt: null,
  valid: true,
};

async function renderInvite() {
  const { default: InvitePage } = await import("@/pages/invite");
  const result = render(
    <MemoryRouter>
      <InvitePage />
    </MemoryRouter>,
  );
  // The page fetches the invite in a mount effect; the response resolves on
  // microtasks after render's act scope has exited. Drain it inside act so
  // the resulting state updates stay covered (otherwise React warns about
  // updates outside act, non-deterministically per timing).
  await act(async () => {});
  return result;
}

describe("InvitePage", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    toastMock.toast.error.mockReset();
    apiMock.default.get.mockReset();
    apiMock.default.post.mockReset();
  });

  it("renders a valid invite with the board name and role", async () => {
    apiMock.default.get.mockResolvedValueOnce({ data: validInvite });
    await renderInvite();

    await waitFor(() => {
      expect(
        screen.getByText("You've been invited to collaborate"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Team Board")).toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
    expect(screen.getByText("This invite never expires")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Join board" }),
    ).toBeInTheDocument();
  });

  it("shows the expired message when a valid invite has a future-dated check but is already past expiry", async () => {
    apiMock.default.get.mockResolvedValueOnce({
      data: {
        ...validInvite,
        valid: false,
        expiresAt: new Date(Date.now() - 1000 * 60).toISOString(),
      },
    });
    await renderInvite();

    await waitFor(() => {
      expect(screen.getByText("Invite no longer valid")).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        "This invitation has expired. Ask the board owner for a new link.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Join board" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to Home" }),
    ).toBeInTheDocument();
  });

  it("shows the revoked/exhausted message when the invite is invalid without an expiry date", async () => {
    apiMock.default.get.mockResolvedValueOnce({
      data: { ...validInvite, valid: false, expiresAt: null },
    });
    await renderInvite();

    await waitFor(() => {
      expect(screen.getByText("Invite no longer valid")).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        "This invitation has been revoked or has reached its use limit.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Join board" }),
    ).not.toBeInTheDocument();
  });

  it("shows the not-found card with a home link on 404", async () => {
    apiMock.default.get.mockRejectedValue(
      new AxiosError(
        "Request failed with status code 404",
        "ERR_BAD_REQUEST",
        undefined,
        undefined,
        { status: 404, data: {} } as never,
      ),
    );
    await renderInvite();

    await waitFor(() => {
      expect(screen.getByText("Invite not found")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("link", { name: "Back to Home" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Join board" }),
    ).not.toBeInTheDocument();
  });

  it("redeems the invite and navigates to the board on success", async () => {
    apiMock.default.get.mockResolvedValueOnce({ data: validInvite });
    apiMock.default.post.mockResolvedValue({ data: { boardId: "b1" } });
    const user = userEvent.setup();
    await renderInvite();

    await user.click(await screen.findByRole("button", { name: "Join board" }));

    await waitFor(() => {
      expect(apiMock.default.post).toHaveBeenCalledWith("/invites/redeem", {
        token: "tok1",
      });
    });
    expect(navigateMock).toHaveBeenCalledWith("/board/b1", { replace: true });
    // Terminal state: isSubmitting has been reset once the handler settles.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Join board" }),
      ).toBeEnabled();
    });
  });

  it("shows a toast and stays on the page when redemption fails", async () => {
    apiMock.default.get.mockResolvedValueOnce({ data: validInvite });
    apiMock.default.post.mockRejectedValue(
      new AxiosError(
        "Request failed with status code 400",
        "ERR_BAD_REQUEST",
        undefined,
        undefined,
        { status: 400, data: { message: "Invite is not redeemable" } } as never,
      ),
    );
    const user = userEvent.setup();
    await renderInvite();

    await user.click(await screen.findByRole("button", { name: "Join board" }));

    await waitFor(() => {
      expect(toastMock.toast.error).toHaveBeenCalledWith(
        "Invite is not redeemable",
      );
    });
    expect(navigateMock).not.toHaveBeenCalled();
    // Terminal state: isSubmitting has been reset once the handler settles.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Join board" }),
      ).toBeEnabled();
    });
  });
});
