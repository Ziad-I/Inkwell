import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/api", () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { id: "board-123", title: "Test Board" } }),
    get: vi.fn().mockResolvedValue({ data: { id: "board-123", roomId: "room-123", title: "Test Board", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }),
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
    expect(screen.getAllByPlaceholderText("(Optional) Your name...").length).toBe(2);
  });

  it("shows Room code input on join card", async () => {
    const { ActionCards } = await import("@/components/home/actionCards");
    render(
      <MemoryRouter>
        <ActionCards />
      </MemoryRouter>,
    );

    expect(screen.getByPlaceholderText("Room code or board link...")).toBeInTheDocument();
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
      expect(api.default.post).toHaveBeenCalledWith("/boards", expect.any(Object));
    });
  });
});
