import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Switch } from "@/components/ui/switch";

describe("Switch", () => {
  it("can be toggled", async () => {
    const user = userEvent.setup();
    let checked = false;
    render(
      <Switch
        checked={checked}
        onCheckedChange={(v) => {
          checked = v;
        }}
      />,
    );

    await user.click(screen.getByRole("switch"));

    expect(checked).toBe(true);
  });

  it("is disabled when disabled prop is set", () => {
    render(<Switch disabled />);
    expect(screen.getByRole("switch")).toBeDisabled();
  });
});
