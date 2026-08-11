import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ThemeProvider } from "@/providers/themeProvider";

const storeMock = vi.hoisted(() => ({
  user: null as { id: string; username: string; email: string } | null,
  status: "unauthenticated" as string,
  clearSession: vi.fn(),
}));

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
vi.mock("@/lib/api", () => ({
  default: { post: vi.fn().mockResolvedValue({ status: 204 }) },
}));

async function renderHeader() {
  const { Header } = await import("@/components/home/header");
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("Header", () => {
  it("shows the auth entry points for guests", async () => {
    await renderHeader();

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(
      screen.getByRole("link", { name: "Create account" }),
    ).toHaveAttribute("href", "/register");
  });
});