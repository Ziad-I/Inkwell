import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import HomePage from "@/pages/home";

vi.mock("@/lib/api", () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { id: "board-123" } }),
    get: vi.fn().mockResolvedValue({ data: { id: "board-123" } }),
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

describe("HomePage integration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders all major sections", async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("Inkwell").length).toBeGreaterThan(0);
    expect(screen.getByText("Create, Collaborate,")).toBeInTheDocument();
    expect(screen.getByText("Start Fresh")).toBeInTheDocument();
    expect(screen.getByText("Join Session")).toBeInTheDocument();
    expect(screen.getByText("Everything you need to collaborate")).toBeInTheDocument();
    expect(screen.getByText(/Built for creative collaboration/)).toBeInTheDocument();
  });
});
