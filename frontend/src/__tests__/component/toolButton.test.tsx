import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ToolButton from "@/components/board/toolbar/toolButton";

const MockIcon = () => <svg data-testid="mock-icon" />;

describe("ToolButton", () => {
  it("renders with tool icon and title", () => {
    render(
      <ToolButton
        toolId="brush"
        toolLabel="Brush"
        toolIcon={MockIcon}
      />,
    );

    expect(screen.getByTitle("Brush")).toBeInTheDocument();
    expect(screen.getByTestId("mock-icon")).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <ToolButton
        toolId="brush"
        toolLabel="Brush"
        toolIcon={MockIcon}
        onClick={onClick}
      />,
    );

    await user.click(screen.getByTitle("Brush"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders with active state", () => {
    render(
      <ToolButton
        toolId="brush"
        toolLabel="Brush"
        toolIcon={MockIcon}
        isActive
      />,
    );

    const btn = screen.getByTitle("Brush");
    expect(btn).toBeInTheDocument();
  });
});
