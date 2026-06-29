/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BraveShieldsNotice } from "@/components/home/braveWarning";

const STORAGE_KEY = "dismiss_brave_shields_notice_v1";

describe("BraveShieldsNotice", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the notice when Brave browser is detected", async () => {
    (navigator as any).brave = { isBrave: vi.fn().mockResolvedValue(true) };

    render(<BraveShieldsNotice />);

    await waitFor(() => {
      expect(screen.getByText(/Brave Shields may block/)).toBeInTheDocument();
    });

    expect(screen.getByText(/It looks like you/)).toBeInTheDocument();
  });

  it("shows nothing when not in Brave", async () => {
    (navigator as any).brave = { isBrave: vi.fn().mockResolvedValue(false) };

    const { container } = render(<BraveShieldsNotice />);

    await vi.waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("shows nothing when brave API is absent", () => {
    (navigator as any).brave = undefined;

    const { container } = render(<BraveShieldsNotice />);

    expect(container.innerHTML).toBe("");
  });

  it("shows nothing when previously dismissed", async () => {
    localStorage.setItem(STORAGE_KEY, "1");
    (navigator as any).brave = { isBrave: vi.fn().mockResolvedValue(true) };

    const { container } = render(<BraveShieldsNotice />);

    await vi.waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("dismisses permanently when clicking 'Don't show again'", async () => {
    const user = userEvent.setup();
    (navigator as any).brave = { isBrave: vi.fn().mockResolvedValue(true) };

    render(<BraveShieldsNotice />);

    await waitFor(() => {
      expect(screen.getByText("Don't show again")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Don't show again"));

    expect(localStorage.getItem(STORAGE_KEY)).toBe("1");
    expect(screen.queryByText(/Brave Shields/)).not.toBeInTheDocument();
  });

  it("closes when clicking the X button", async () => {
    const user = userEvent.setup();
    (navigator as any).brave = { isBrave: vi.fn().mockResolvedValue(true) };

    render(<BraveShieldsNotice />);

    await waitFor(() => {
      expect(screen.getByLabelText("close")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("close"));

    expect(screen.queryByText(/Brave Shields/)).not.toBeInTheDocument();
  });
});
