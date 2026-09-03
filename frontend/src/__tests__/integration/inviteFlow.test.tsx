import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

const inviteApiMock = vi.hoisted(() => ({
  get: vi.fn(),
  redeem: vi.fn(),
}));

vi.mock("@/api", async () => {
  const actual = await vi.importActual<typeof import("@/api")>("@/api");
  return { ...actual, inviteApi: inviteApiMock };
});
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

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

describe("Invite flow", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    inviteApiMock.get.mockReset();
    inviteApiMock.redeem.mockReset();
    inviteApiMock.get.mockResolvedValueOnce({
      boardId: "b1",
      boardName: "Team Board",
      role: "viewer",
      expiresAt: null,
      valid: true,
    });
    inviteApiMock.redeem.mockResolvedValue({ boardId: "b1" });
  });

  it("renders the invite card and redeems the invite", async () => {
    const { default: InvitePage } = await import("@/pages/invite");
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/invite/tok1"]}>
        <InvitePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText("You've been invited to collaborate"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Team Board")).toBeInTheDocument();
    expect(screen.getByText("Viewer")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Join board" }));

    await waitFor(() => {
      expect(inviteApiMock.redeem).toHaveBeenCalledWith("tok1", {
        allowAuthRefresh: false,
      });
    });
    expect(navigateMock).toHaveBeenCalledWith("/board/b1", { replace: true });
  });
});
