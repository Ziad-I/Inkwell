import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { useAuthStore } from "@/stores/authStore";

vi.mock("@/lib/api", () => ({
  default: {
    post: vi
      .fn()
      .mockResolvedValue({ data: { id: "board-123", title: "Test Board" } }),
    get: vi.fn().mockResolvedValue({
      data: {
        id: "board-123",
        roomId: "room-123",
        title: "Test Board",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }),
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

describe("ActionCards integration", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      status: "idle",
    });
  });

  it("renders both create and join cards", async () => {
    const { ActionCards } = await import("@/components/home/actionCards");
    render(
      <MemoryRouter>
        <ActionCards />
      </MemoryRouter>,
    );

    expect(screen.getByText("Start Fresh")).toBeInTheDocument();
    expect(screen.getByText("Join Session")).toBeInTheDocument();
    expect(
      screen.getAllByPlaceholderText("(Optional) Your name...").length,
    ).toBe(2);
  });

  it("shows Room code input on join card", async () => {
    const { ActionCards } = await import("@/components/home/actionCards");
    render(
      <MemoryRouter>
        <ActionCards />
      </MemoryRouter>,
    );

    expect(
      screen.getByPlaceholderText("Room code or board link..."),
    ).toBeInTheDocument();
  });

  it("join button is disabled when room code is empty", async () => {
    const { ActionCards } = await import("@/components/home/actionCards");
    render(
      <MemoryRouter>
        <ActionCards />
      </MemoryRouter>,
    );

    const joinButtons = screen.getAllByRole("button");
    const joinBtn = joinButtons.find((btn) => btn.textContent === "Join Board");
    expect(joinBtn).toBeDisabled();
  });

  it("renders draw permission select on create card", async () => {
    const { ActionCards } = await import("@/components/home/actionCards");
    render(
      <MemoryRouter>
        <ActionCards />
      </MemoryRouter>,
    );

    expect(screen.getByText("Who can draw?")).toBeInTheDocument();
  });

  it("creates board calls API", async () => {
    const user = userEvent.setup();
    const api = await import("@/lib/api");
    const { ActionCards } = await import("@/components/home/actionCards");

    render(
      <MemoryRouter>
        <ActionCards />
      </MemoryRouter>,
    );

    const createBtn = screen.getByText("Create Board");
    await user.click(createBtn);

    await waitFor(() => {
      expect(api.default.post).toHaveBeenCalledWith(
        "/boards",
        expect.any(Object),
      );
    });
  });

  it("disables the Only me option and shows a hint for guests", async () => {
    const { ActionCards } = await import("@/components/home/actionCards");

    render(
      <MemoryRouter>
        <ActionCards />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("Sign in to create boards with draw permissions."),
    ).toBeInTheDocument();

    const nativeSelect = document.querySelector("select") as HTMLSelectElement;
    const anyone = [...nativeSelect.options].find((o) => o.value === "anyone")!;
    const onlyMe = [...nativeSelect.options].find((o) => o.value === "owner")!;
    expect(onlyMe.disabled).toBe(true);
    expect(anyone.disabled).toBe(false);
  });

  it("enables the Only me option for authenticated users", async () => {
    useAuthStore.setState({
      user: { id: "user-1", username: "alice", email: "a@b.c" },
      accessToken: "access-1",
      status: "authenticated",
    });
    const { ActionCards } = await import("@/components/home/actionCards");

    render(
      <MemoryRouter>
        <ActionCards />
      </MemoryRouter>,
    );

    expect(
      screen.queryByText("Sign in to create boards only you can draw on."),
    ).not.toBeInTheDocument();

    const nativeSelect = document.querySelector("select") as HTMLSelectElement;
    const onlyMe = [...nativeSelect.options].find((o) => o.value === "owner")!;
    expect(onlyMe.disabled).toBe(false);
  });
});
