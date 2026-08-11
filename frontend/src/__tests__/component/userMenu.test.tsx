import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

const storeMock = vi.hoisted(() => ({
  user: null as { id: string; username: string; email: string } | null,
  status: "unauthenticated" as string,
  clearSession: vi.fn(),
}));

const apiMock = vi.hoisted(() => ({ default: { post: vi.fn() } }));

vi.mock("@/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        user: storeMock.user,
        status: storeMock.status,
        clearSession: storeMock.clearSession,
      }),
    {
      getState: () => ({
        user: storeMock.user,
        status: storeMock.status,
        clearSession: storeMock.clearSession,
      }),
    },
  ),
}));
vi.mock("@/lib/api", () => apiMock);

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => navigateMock };
});

async function renderUserMenu() {
  const { UserMenu } = await import("@/components/auth/userMenu");
  return render(
    <MemoryRouter>
      <UserMenu />
    </MemoryRouter>,
  );
}

describe("UserMenu", () => {
  beforeEach(() => {
    storeMock.user = null;
    storeMock.status = "unauthenticated";
    storeMock.clearSession.mockReset();
    navigateMock.mockReset();
    apiMock.default.post.mockReset();
    apiMock.default.post.mockResolvedValue({ status: 204 });
  });

  it("renders nothing while the session is loading", async () => {
    storeMock.status = "loading";
    await renderUserMenu();

    expect(
      screen.queryByRole("link", { name: "Sign in" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Create account" }),
    ).not.toBeInTheDocument();
  });

  it("renders Sign in and Create account links for guests", async () => {
    await renderUserMenu();

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(
      screen.getByRole("link", { name: "Create account" }),
    ).toHaveAttribute("href", "/register");
  });

  it("shows the avatar initials and menu for an authenticated user", async () => {
    storeMock.user = { id: "u1", username: "alice", email: "a@b.c" };
    storeMock.status = "authenticated";
    await renderUserMenu();

    const trigger = screen.getByRole("button", { name: /alice/i });
    expect(trigger).toHaveTextContent("AL");
    await userEvent.click(trigger);
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("a@b.c")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Log out" }),
    ).toBeInTheDocument();
  });

  it("logs out: posts to the api, clears the session, navigates home", async () => {
    storeMock.user = { id: "u1", username: "alice", email: "a@b.c" };
    storeMock.status = "authenticated";
    await renderUserMenu();

    await userEvent.click(screen.getByRole("button", { name: /alice/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Log out" }));

    expect(apiMock.default.post).toHaveBeenCalledWith("/auth/logout");
    expect(storeMock.clearSession).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("/");
  });

  it("clears the session and navigates home even if logout fails", async () => {
    storeMock.user = { id: "u1", username: "alice", email: "a@b.c" };
    storeMock.status = "authenticated";
    apiMock.default.post.mockRejectedValue(new Error("network down"));
    await renderUserMenu();

    await userEvent.click(screen.getByRole("button", { name: /alice/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Log out" }));

    expect(storeMock.clearSession).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("/");
  });
});