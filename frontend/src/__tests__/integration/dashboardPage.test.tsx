import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  waitFor,
  render,
  screen,
  fireEvent,
  within,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

const boardApiMock = vi.hoisted(() => ({
  get: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  rename: vi.fn(),
  duplicate: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  delete: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/api", async () => {
  const actual = await vi.importActual<typeof import("@/api")>("@/api");
  return { ...actual, boardApi: boardApiMock };
});
vi.mock("sonner", () => toastMock);

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

function makeBoard(
  id: string,
  title: string,
  updatedAt: string,
  archivedAt: string | null = null,
) {
  return {
    id,
    title,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
    archivedAt,
  };
}

const activeBoards = [
  makeBoard("b1", "Alpha", "2026-02-01T00:00:00.000Z"),
  makeBoard("b2", "Beta", "2026-03-01T00:00:00.000Z"),
];

const archivedBoards = [
  makeBoard(
    "b3",
    "Old Board",
    "2026-01-05T00:00:00.000Z",
    "2026-01-10T00:00:00.000Z",
  ),
];

// Post-mutation refetch payloads. Tests assert on the UI these can ONLY
// produce once the refetch's setBoards has actually applied — mock-call
// assertions alone would end the test with updates still in flight.
const renamedBoards = [
  makeBoard("b1", "Renamed Board", "2026-02-01T00:00:00.000Z"),
  makeBoard("b2", "Beta", "2026-03-01T00:00:00.000Z"),
];

const duplicatedBoards = [
  ...activeBoards,
  makeBoard("b9", "Alpha Copy", "2026-03-02T00:00:00.000Z"),
];

const betaOnly = [activeBoards[1]];

const restoredActiveBoards = [
  makeBoard("b3", "Old Board", "2026-02-15T00:00:00.000Z"),
];

async function renderDashboard() {
  const { default: DashboardPage } = await import("@/pages/dashboard");
  const result = render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
  // Drain the mount fetch's microtask continuation inside act so the
  // resulting state updates stay covered regardless of machine timing.
  await act(async () => {});
  return result;
}

async function openBoardActions(boardTitle = "Alpha") {
  // Default sort is updatedAt desc, so never assume a fixed row index;
  // target the actions button inside the row for the given board.
  // The menu trigger must stay fireEvent: Base UI triggers ignore
  // user-event's synthetic pointer sequence in jsdom.
  const row = screen.getByRole("row", { name: new RegExp(boardTitle) });
  fireEvent.click(within(row).getByRole("button", { name: "Board actions" }));
  await screen.findByRole("menu");
}

describe("DashboardPage integration", () => {
  beforeEach(() => {
    toastMock.toast.error.mockReset();
    toastMock.toast.success.mockReset();
    navigateMock.mockReset();
    boardApiMock.get.mockReset();
    boardApiMock.create.mockReset();
    boardApiMock.list.mockReset();
    boardApiMock.rename.mockReset();
    boardApiMock.duplicate.mockReset();
    boardApiMock.archive.mockReset();
    boardApiMock.restore.mockReset();
    boardApiMock.delete.mockReset();
    boardApiMock.get.mockResolvedValue({ id: "b1" });
    boardApiMock.list.mockResolvedValue({ boards: activeBoards });
    boardApiMock.create.mockResolvedValue({ id: "b9" });
    boardApiMock.rename.mockResolvedValue(undefined);
    boardApiMock.duplicate.mockResolvedValue({ id: "b9" });
    boardApiMock.archive.mockResolvedValue(undefined);
    boardApiMock.restore.mockResolvedValue(undefined);
    boardApiMock.delete.mockResolvedValue(undefined);
  });

  it("renders the heading, tabs, and fetches active boards on load", async () => {
    await renderDashboard();

    expect(screen.getByText("Your boards")).toBeInTheDocument();
    expect(screen.getByText("New board")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Active" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Archived" })).toBeInTheDocument();

    await screen.findByText("Alpha");
    expect(boardApiMock.list).toHaveBeenCalledWith({ status: "active" });
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("renders board rows with formatted dates", async () => {
    await renderDashboard();

    await screen.findByText("Alpha");
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(3); // header + 2 boards

    const alphaRow = screen.getByRole("row", { name: /Alpha/ });
    expect(within(alphaRow).getByText("Alpha")).toBeInTheDocument();
    // toLocaleDateString in the test env uses US format (M/D/YYYY)
    expect(within(alphaRow).getByText("1/1/2026")).toBeInTheDocument();
    expect(within(alphaRow).getByText("2/1/2026")).toBeInTheDocument();
  });

  it("shows the empty state when there are no active boards", async () => {
    boardApiMock.list.mockResolvedValue({ boards: [] });
    await renderDashboard();

    expect(await screen.findByText("No active boards yet")).toBeInTheDocument();
    // Header button + empty state button
    expect(screen.getAllByRole("button", { name: /New board/i })).toHaveLength(
      2,
    );
  });

  it("shows no create button in the archived empty state", async () => {
    boardApiMock.list.mockResolvedValue({ boards: [] });
    const user = userEvent.setup();
    await renderDashboard();

    await screen.findByText("No active boards yet");
    await user.click(screen.getByRole("tab", { name: "Archived" }));

    expect(await screen.findByText("No archived boards")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /New board/i })).toHaveLength(
      1,
    );
    expect(boardApiMock.list).toHaveBeenCalledWith({ status: "archived" });
  });

  it("switches to the archived tab and lists archived boards with Restore action", async () => {
    boardApiMock.list
      .mockResolvedValueOnce({ boards: activeBoards })
      .mockResolvedValueOnce({ boards: archivedBoards });
    const user = userEvent.setup();
    await renderDashboard();

    await screen.findByText("Alpha");
    await user.click(screen.getByRole("tab", { name: "Archived" }));

    await screen.findByText("Old Board");
    expect(boardApiMock.list).toHaveBeenCalledWith({ status: "archived" });

    await openBoardActions("Old Board");
    expect(
      screen.getByRole("menuitem", { name: "Restore" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Archive" }),
    ).not.toBeInTheDocument();
  });

  it("sorts boards by name when clicking the Name header", async () => {
    await renderDashboard();

    await screen.findByText("Beta"); // default sort: updatedAt desc → Beta first

    const rows = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.querySelector("button")?.textContent);

    expect(rows()).toEqual(["Beta", "Alpha"]);

    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(rows()).toEqual(["Alpha", "Beta"]);
    expect(screen.getByRole("columnheader", { name: "Name" })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );

    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(rows()).toEqual(["Beta", "Alpha"]);
    expect(screen.getByRole("columnheader", { name: "Name" })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
  });

  it("creates a board and navigates to it", async () => {
    const user = userEvent.setup();
    await renderDashboard();

    await screen.findByText("Alpha");
    await user.click(screen.getByRole("button", { name: "New board" }));

    await waitFor(() => {
      expect(boardApiMock.create).toHaveBeenCalledWith({
        name: "Untitled Board",
      });
    });
    expect(navigateMock).toHaveBeenCalledWith("/board/b9", {
      state: { skipValidation: true },
    });
    // Terminal state: isCreating has been reset once the handler settles.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "New board" })).toBeEnabled();
    });
  });

  it("renames a board through the actions menu", async () => {
    boardApiMock.list
      .mockResolvedValueOnce({ boards: activeBoards })
      .mockResolvedValueOnce({ boards: renamedBoards });
    const user = userEvent.setup();
    await renderDashboard();

    await screen.findByText("Alpha");
    await openBoardActions();

    await user.click(screen.getByRole("menuitem", { name: "Rename" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Rename board")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Board name"), {
      target: { value: "Renamed Board" },
    });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(boardApiMock.rename).toHaveBeenCalledWith("b1", "Renamed Board");
    });
    await waitFor(() => {
      expect(toastMock.toast.success).toHaveBeenCalledWith(
        "Board “Alpha” renamed to “Renamed Board”",
      );
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Terminal UI: the row only shows the new title once the refetch's
    // setBoards has applied — the assertion the old get-call-count skipped.
    expect(await screen.findByText("Renamed Board")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("duplicates a board through the actions menu", async () => {
    boardApiMock.list
      .mockResolvedValueOnce({ boards: activeBoards })
      .mockResolvedValueOnce({ boards: duplicatedBoards });
    const user = userEvent.setup();
    await renderDashboard();

    await screen.findByText("Alpha");
    await openBoardActions();

    await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));

    await waitFor(() => {
      expect(boardApiMock.duplicate).toHaveBeenCalledWith("b1");
    });
    await waitFor(() => {
      expect(toastMock.toast.success).toHaveBeenCalledWith(
        "Board “Alpha” duplicated",
      );
    });
    // Terminal UI: the copy only exists after the refetch applied.
    expect(await screen.findByText("Alpha Copy")).toBeInTheDocument();
  });

  it("archives a board through the actions menu", async () => {
    boardApiMock.list
      .mockResolvedValueOnce({ boards: activeBoards })
      .mockResolvedValueOnce({ boards: betaOnly });
    const user = userEvent.setup();
    await renderDashboard();

    await screen.findByText("Alpha");
    await openBoardActions();

    await user.click(screen.getByRole("menuitem", { name: "Archive" }));

    await waitFor(() => {
      expect(boardApiMock.archive).toHaveBeenCalledWith("b1");
    });
    await waitFor(() => {
      expect(toastMock.toast.success).toHaveBeenCalledWith(
        "Board “Alpha” archived",
      );
    });
    // Terminal UI: Alpha can only disappear once the refetch applied.
    await waitFor(() => {
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("restores an archived board through the actions menu", async () => {
    boardApiMock.list
      .mockResolvedValueOnce({ boards: activeBoards })
      .mockResolvedValueOnce({ boards: archivedBoards })
      .mockResolvedValue({ boards: restoredActiveBoards });
    const user = userEvent.setup();
    await renderDashboard();

    await screen.findByText("Alpha");
    await user.click(screen.getByRole("tab", { name: "Archived" }));
    await screen.findByText("Old Board");

    await openBoardActions("Old Board");
    await user.click(screen.getByRole("menuitem", { name: "Restore" }));

    await waitFor(() => {
      expect(boardApiMock.restore).toHaveBeenCalledWith("b3");
    });
    await waitFor(() => {
      expect(toastMock.toast.success).toHaveBeenCalledWith(
        "Board “Old Board” restored",
      );
    });
    // Terminal UI: Old Board back under Active after the tab's refetch.
    await user.click(screen.getByRole("tab", { name: "Active" }));
    expect(await screen.findByText("Old Board")).toBeInTheDocument();
  });

  it("deletes a board after confirming the dialog", async () => {
    boardApiMock.list
      .mockResolvedValueOnce({ boards: activeBoards })
      .mockResolvedValueOnce({ boards: betaOnly });
    const user = userEvent.setup();
    await renderDashboard();

    await screen.findByText("Alpha");
    await openBoardActions();

    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(/This will permanently delete/),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(boardApiMock.delete).toHaveBeenCalledWith("b1");
    });
    await waitFor(() => {
      expect(toastMock.toast.success).toHaveBeenCalledWith(
        "Board “Alpha” deleted",
      );
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    // Terminal UI: Alpha can only disappear once the refetch applied.
    await waitFor(() => {
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("cancels the delete dialog without deleting", async () => {
    const user = userEvent.setup();
    await renderDashboard();

    await screen.findByText("Alpha");
    await openBoardActions();

    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(boardApiMock.delete).not.toHaveBeenCalled();
  });

  it("shows a toast when loading boards fails", async () => {
    boardApiMock.list.mockRejectedValue(new Error("network down"));
    await renderDashboard();

    await waitFor(() => {
      expect(toastMock.toast.error).toHaveBeenCalledWith(
        "The service is temporarily unavailable. Please try again.",
      );
    });
    // Terminal UI: the loading lifecycle finished (finally ran) and the
    // empty state rendered.
    expect(await screen.findByText("No active boards yet")).toBeInTheDocument();
  });

  it("shows a toast when creating a board fails and stays on the page", async () => {
    boardApiMock.create.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    await renderDashboard();

    await screen.findByText("Alpha");
    await user.click(screen.getAllByRole("button", { name: /New board/i })[0]);

    await waitFor(() => {
      expect(toastMock.toast.error).toHaveBeenCalledWith(
        "The service is temporarily unavailable. Please try again.",
      );
    });
    expect(navigateMock).not.toHaveBeenCalled();
    // Terminal state: isCreating has been reset once the handler settles.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "New board" })).toBeEnabled();
    });
  });
});
