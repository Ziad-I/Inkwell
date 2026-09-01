import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor, render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { AxiosError } from "axios";
import { useSessionStore } from "@/stores/sessionStore";
import type { BoardSessionSnapshot } from "@/types/session";

const apiMock = vi.hoisted(() => ({
  default: { post: vi.fn() },
}));

const toastMock = vi.hoisted(() => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, default: apiMock.default };
});
vi.mock("sonner", () => toastMock);

const paramsMock = vi.hoisted(() => ({ roomId: "b1" }));
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useParams: () => paramsMock,
  };
});

async function openShareDialog() {
  const { default: ShareDialog } =
    await import("@/components/board/share/shareDialog");
  render(
    <MemoryRouter>
      <ShareDialog />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Share" }));
  await screen.findByRole("dialog");
}

async function pickOption(optionName: RegExp | string) {
  const option = await screen.findByRole("option", { name: optionName });
  fireEvent.pointerDown(option);
  fireEvent.pointerUp(option);
  fireEvent.click(option);
}

describe("ShareDialog", () => {
  beforeEach(() => {
    toastMock.toast.error.mockReset();
    toastMock.toast.success.mockReset();
    apiMock.default.post.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it("renders the role and expiry selects and the create button", async () => {
    await openShareDialog();

    expect(screen.getByText("Share board")).toBeInTheDocument();
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Create link" }),
    ).toBeInTheDocument();
  });

  it("changes the role through the select menu before creating the link", async () => {
    apiMock.default.post.mockResolvedValue({ data: { token: "tok123" } });
    await openShareDialog();

    const [roleTrigger] = screen.getAllByRole("combobox");
    expect(roleTrigger).toHaveTextContent("Editor");

    fireEvent.click(roleTrigger);
    await pickOption(/viewer/i);

    expect(roleTrigger).toHaveTextContent("Viewer");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Create link" }));
    // Terminal state: isCreating has been reset once the handler settles.
    await screen.findByRole("button", { name: "Create link" });
    await waitFor(() => {
      expect(apiMock.default.post).toHaveBeenCalledWith("/boards/b1/invites", {
        role: "viewer",
      });
    });
  });

  it("changes the expiry through the select menu and sends expiresAt", async () => {
    apiMock.default.post.mockResolvedValue({ data: { token: "tok123" } });
    await openShareDialog();

    const [, expiryTrigger] = screen.getAllByRole("combobox");
    expect(expiryTrigger).toHaveTextContent("Never");

    fireEvent.click(expiryTrigger);
    await pickOption("1 day");

    expect(expiryTrigger).toHaveTextContent("1 day");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Create link" }));
    // Terminal state: isCreating has been reset once the handler settles.
    await screen.findByRole("button", { name: "Create link" });
    await waitFor(() => {
      expect(apiMock.default.post).toHaveBeenCalledWith("/boards/b1/invites", {
        role: "editor",
        expiresAt: expect.any(String),
      });
    });
  });

  it("creates an invite link with the default role and shows the one-time URL", async () => {
    apiMock.default.post.mockResolvedValue({ data: { token: "tok123" } });
    await openShareDialog();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Create link" }));
    // Terminal state: isCreating has been reset once the handler settles.
    await screen.findByRole("button", { name: "Create link" });

    await waitFor(() => {
      expect(apiMock.default.post).toHaveBeenCalledWith("/boards/b1/invites", {
        role: "editor",
      });
    });
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toContain(
      "/invite/tok123",
    );
  });

  it("copies the invite link to the clipboard", async () => {
    apiMock.default.post.mockResolvedValue({ data: { token: "tok123" } });
    await openShareDialog();

    // fireEvent throughout, not userEvent: user-event.setup() replaces
    // navigator.clipboard, which would unspy writeText for the assertion
    // below.
    fireEvent.click(screen.getByRole("button", { name: "Create link" }));
    // Terminal state: isCreating has been reset once the handler settles.
    await screen.findByRole("button", { name: "Create link" });
    fireEvent.click(await screen.findByRole("button", { name: "Copy" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("/invite/tok123"),
      );
    });
    expect(toastMock.toast.success).toHaveBeenCalledWith("Link copied");
  });

  it("shows a toast and no link when invite creation fails", async () => {
    apiMock.default.post.mockRejectedValue(
      new AxiosError(
        "Request failed with status code 403",
        "ERR_BAD_REQUEST",
        { url: "/boards/b1/invites", method: "post" } as never,
        undefined,
        {
          status: 403,
          data: { message: "alice@example.com cannot open Secret Roadmap" },
        } as never,
      ),
    );
    await openShareDialog();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Create link" }));
    // Terminal state: isCreating has been reset once the handler settles.
    await screen.findByRole("button", { name: "Create link" });

    await waitFor(() => {
      expect(toastMock.toast.error).toHaveBeenCalledWith(
        "Only the board owner can create invitation links.",
      );
    });
    expect(
      screen.queryByRole("button", { name: "Copy" }),
    ).not.toBeInTheDocument();
  });
});

describe("ToolSettings share gating", () => {
  const snapshot = (
    overrides: Partial<BoardSessionSnapshot> = {},
  ): BoardSessionSnapshot => ({
    epoch: "gen-1",
    roomId: "b1",
    phase: "ready",
    role: "owner",
    permissions: { read: true, draw: true },
    canDraw: true,
    error: null,
    ...overrides,
  });

  async function renderToolSettings(session: BoardSessionSnapshot) {
    useSessionStore.setState({ session });
    const { default: ToolSettings } =
      await import("@/components/board/toolbar/toolSettings");
    return render(<ToolSettings />);
  }

  it("shows the Share button for owners", async () => {
    await renderToolSettings(snapshot({ role: "owner" }));

    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
  });

  it("hides the Share button for editors", async () => {
    await renderToolSettings(snapshot({ role: "editor" }));

    expect(
      screen.queryByRole("button", { name: "Share" }),
    ).not.toBeInTheDocument();
  });

  it("hides the Share button for viewers", async () => {
    await renderToolSettings(snapshot({ role: "viewer" }));

    expect(
      screen.queryByRole("button", { name: "Share" }),
    ).not.toBeInTheDocument();
  });

  it("hides the Share button while joining", async () => {
    await renderToolSettings(
      snapshot({
        phase: "joining",
        role: null,
        permissions: { read: false, draw: false },
        canDraw: false,
      }),
    );

    expect(
      screen.queryByRole("button", { name: "Share" }),
    ).not.toBeInTheDocument();
  });
});
