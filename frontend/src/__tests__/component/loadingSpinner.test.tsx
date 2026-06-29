import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingSpinner } from "@/components/home/LoadingSpinner";

describe("LoadingSpinner", () => {
  it("renders loading text", () => {
    render(<LoadingSpinner />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
});
