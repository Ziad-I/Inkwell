import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import RemotePresenceDot from "@/components/board/presence/remotePresenceDot";
import { useRemotePresenceStore } from "@/stores/remotePresenceStore";

vi.mock("@/components/board/presence/presenceDot", () => ({
  PresenceDot: ({
    userName,
    visible,
    pos,
  }: {
    userName: string;
    visible: boolean;
    pos: { x: number; y: number } | null;
  }) =>
    visible ? (
      <div data-testid="remote-dot" data-pos={`${pos?.x},${pos?.y}`}>
        {userName}
      </div>
    ) : null,
}));

beforeEach(() => {
  useRemotePresenceStore.getState().clearAll();
});

describe("RemotePresenceDot", () => {
  it("renders nothing when no remote users are present", () => {
    render(<RemotePresenceDot />);

    expect(screen.queryAllByTestId("remote-dot")).toHaveLength(0);
  });

  it("renders one positioned dot per remote user that has moved", () => {
    render(<RemotePresenceDot />);

    act(() => {
      useRemotePresenceStore
        .getState()
        .applyJoin("user-1", { userName: "Ada", userColor: "#123456" });
      useRemotePresenceStore
        .getState()
        .applyJoin("user-2", { userName: "Bob", userColor: "#abcdef" });
      useRemotePresenceStore.getState().applyMove("user-1", { x: 5, y: 6 });
    });

    // Only Ada has a position; Bob is known but has not moved yet.
    const dots = screen.getAllByTestId("remote-dot");
    expect(dots).toHaveLength(1);
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
    expect(dots[0]).toHaveAttribute("data-pos", "5,6");
  });

  it("removes a dot when the user leaves", () => {
    render(<RemotePresenceDot />);

    act(() => {
      useRemotePresenceStore
        .getState()
        .applyJoin("user-1", { userName: "Ada", userColor: "#123456" });
      useRemotePresenceStore.getState().applyMove("user-1", { x: 5, y: 6 });
    });
    expect(screen.getAllByTestId("remote-dot")).toHaveLength(1);

    act(() => {
      useRemotePresenceStore.getState().applyLeave("user-1");
    });
    expect(screen.queryAllByTestId("remote-dot")).toHaveLength(0);
  });

  it("clears every dot when the presence model is reset", () => {
    render(<RemotePresenceDot />);

    act(() => {
      useRemotePresenceStore
        .getState()
        .applyJoin("user-1", { userName: "Ada", userColor: "#123456" });
      useRemotePresenceStore.getState().applyMove("user-1", { x: 5, y: 6 });
      useRemotePresenceStore.getState().clearAll();
    });

    expect(screen.queryAllByTestId("remote-dot")).toHaveLength(0);
  });
});
