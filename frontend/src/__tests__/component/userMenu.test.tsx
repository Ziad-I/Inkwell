import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

const storeMock = vi.hoisted(() => ({
  user: null as { id: string; username: string; email: string } | null,
  status: "unauthenticated" as string,
  logoutLocally: vi.fn(),
}));

const authApiMock = vi.hoisted(() => ({ logout: vi.fn() }));

vi.mock("@/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        user: storeMock.user,
        status: storeMock.status,
        logoutLocally: storeMock.logoutLocally,
      }),
    {
      getState: () => ({
        user: storeMock.user,
        status: storeMock.status,
        logoutLocally: storeMock.logoutLocally,
      }),
    },
  ),
}));
vi.mock("@/api", async () => {
  const actual = await vi.importActual<typeof import("@/api")>("@/api");
  return { ...actual, authApi: authApiMock };
});

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
    storeMock.logoutLocally.mockReset();
    navigateMock.mockReset();
    authApiMock.logout.mockReset();
    authApiMock.logout.mockResolvedValue(undefined);
  });

  it("renders nothing while the session is restoring", async () => {
    storeMock.status = "restoring";
    await renderUserMenu();

    expect(
      screen.queryByRole("link", { name: "Sign in" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Create account" }),
    ).not.toBeInTheDocument();
  });

  it("renders nothing for guest users", async () => {
    await renderUserMenu();

    expect(
      screen.queryByRole("button", { name: /user menu/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Log out")).not.toBeInTheDocument();
  });

  it("shows the user menu for an authenticated user", async () => {
    storeMock.user = { id: "u1", username: "alice", email: "a@b.c" };
    storeMock.status = "authenticated";
    await renderUserMenu();

    const trigger = screen.getByRole("button", {
      name: "User menu for alice",
    });
    fireEvent.click(trigger);
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Log out" }),
    ).toBeInTheDocument();
  });

  it("logs out: posts to the api, clears the session, navigates home", async () => {
    storeMock.user = { id: "u1", username: "alice", email: "a@b.c" };
    storeMock.status = "authenticated";
    const user = userEvent.setup();
    await renderUserMenu();

    // The menu trigger must stay fireEvent: Base UI triggers ignore
    // user-event's synthetic pointer sequence in jsdom.
    fireEvent.click(screen.getByRole("button", { name: /alice/i }));
    await user.click(screen.getByRole("menuitem", { name: "Log out" }));

    await waitFor(() => {
      expect(authApiMock.logout).toHaveBeenCalledWith();
      expect(storeMock.logoutLocally).toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith("/");
    });
  });

  it("clears the session and navigates home even if logout fails", async () => {
    storeMock.user = { id: "u1", username: "alice", email: "a@b.c" };
    storeMock.status = "authenticated";
    authApiMock.logout.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    await renderUserMenu();

    // The menu trigger must stay fireEvent: Base UI triggers ignore
    // user-event's synthetic pointer sequence in jsdom.
    fireEvent.click(screen.getByRole("button", { name: /alice/i }));
    await user.click(screen.getByRole("menuitem", { name: "Log out" }));

    await waitFor(() => {
      expect(storeMock.logoutLocally).toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith("/");
    });
    expect(authApiMock.logout).toHaveBeenCalled();
  });
});
