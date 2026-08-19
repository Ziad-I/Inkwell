import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

const apiMock = vi.hoisted(() => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
  apiErrorMessage: (_err: unknown, fallback: string) => fallback,
}));

vi.mock("@/lib/api", () => apiMock);
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
    apiMock.default.get.mockReset();
    apiMock.default.post.mockReset();
    apiMock.default.get.mockResolvedValueOnce({
      data: {
        boardId: "b1",
        boardName: "Team Board",
        role: "viewer",
        expiresAt: null,
        valid: true,
      },
    });
    apiMock.default.post.mockResolvedValue({ data: { boardId: "b1" } });
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
      expect(apiMock.default.post).toHaveBeenCalledWith("/invites/redeem", {
        token: "tok1",
      });
    });
    expect(navigateMock).toHaveBeenCalledWith("/board/b1", { replace: true });
  });
});
