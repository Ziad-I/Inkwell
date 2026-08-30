import { describe, expect, it } from "vitest";

import { BoardDocument } from "@/collaboration/boardDocument";
import type { DurableTransition } from "@/types/collaboration";
import type { CommandStatus, RenderableCommand } from "@/types/command";

const strokePayload = {
  nodeId: "node-1",
  points: [0, 0, 12, 14],
  color: "#123abc",
  strokeWidth: 2,
  lineCap: "round" as const,
  lineJoin: "round" as const,
  opacity: 1,
};

function command(
  id: string,
  seq?: number,
  status: CommandStatus = "applied",
): RenderableCommand {
  return {
    id,
    type: "stroke",
    payload: { ...strokePayload, nodeId: `node-${id}` },
    owner: "user-1",
    status,
    timestamp: 1_000,
    ...(seq !== undefined ? { seq } : {}),
  };
}

function finalize(id: string, seq: number): DurableTransition {
  return {
    kind: "finalize",
    commandId: id,
    command: command(id, seq, "applied"),
    seq,
  };
}

function undo(id: string, seq: number): DurableTransition {
  return {
    kind: "undo",
    commandId: id,
    command: command(id, seq, "reverted"),
    seq,
  };
}

function redo(id: string, seq: number): DurableTransition {
  return {
    kind: "redo",
    commandId: id,
    command: command(id, seq, "applied"),
    seq,
  };
}

function documentWith(...commands: RenderableCommand[]): BoardDocument {
  const document = new BoardDocument();
  document.replaceCurrentState(commands);
  return document;
}

describe("BoardDocument acceptTransition sequencing", () => {
  it("applies the first contiguous transition and normalizes its status", () => {
    const document = new BoardDocument();
    const result = document.acceptTransition(finalize("a", 1));

    expect(result).toEqual({
      type: "applied",
      transitions: [
        {
          seq: 1,
          kind: "finalize",
          commandId: "a",
          command: command("a", 1, "applied"),
        },
      ],
    });
    expect(document.getHighestContiguousSeq()).toBe(1);
    expect(document.getCommand("a")).toMatchObject({
      id: "a",
      status: "applied",
      seq: 1,
    });
  });

  it("buffers sequence two and drains after sequence one", () => {
    const document = new BoardDocument();
    expect(document.acceptTransition(finalize("b", 2))).toEqual({
      type: "buffered",
      missingSeq: 1,
    });
    expect(document.acceptTransition(finalize("a", 1))).toMatchObject({
      type: "applied",
      transitions: [{ seq: 1 }, { seq: 2 }],
    });
    expect(document.getHighestContiguousSeq()).toBe(2);
    expect(document.getBufferedSequences()).toEqual([]);
  });

  it("buffers multiple future sequences and drains them in order", () => {
    const document = new BoardDocument();
    expect(document.acceptTransition(finalize("b", 2)).type).toBe("buffered");
    expect(document.acceptTransition(finalize("c", 3)).type).toBe("buffered");
    expect(document.acceptTransition(finalize("e", 5)).type).toBe("buffered");
    expect(document.getBufferedSequences()).toEqual([2, 3, 5]);

    const first = document.acceptTransition(finalize("a", 1));
    expect(first).toMatchObject({
      type: "applied",
      transitions: [{ seq: 1 }, { seq: 2 }, { seq: 3 }],
    });
    expect(document.getHighestContiguousSeq()).toBe(3);
    expect(document.getBufferedSequences()).toEqual([5]);

    const second = document.acceptTransition(finalize("d", 4));
    expect(second).toMatchObject({
      type: "applied",
      transitions: [{ seq: 4 }, { seq: 5 }],
    });
    expect(document.getHighestContiguousSeq()).toBe(5);
  });

  it("never advances the contiguous cursor to a buffered future sequence", () => {
    const document = new BoardDocument();
    document.acceptTransition(finalize("z", 9));

    expect(document.getHighestContiguousSeq()).toBe(0);
    expect(document.getCommand("z")).toBeUndefined();
    expect(document.getCommands()).toEqual([]);
  });
});

describe("BoardDocument duplicate and stale transitions", () => {
  it("ignores an identical re-delivered transition as a duplicate", () => {
    const document = new BoardDocument();
    document.acceptTransition(finalize("a", 1));

    expect(document.acceptTransition(finalize("a", 1))).toEqual({
      type: "duplicate",
      seq: 1,
    });
    expect(document.getHighestContiguousSeq()).toBe(1);
    expect(document.getCommands()).toHaveLength(1);
  });

  it("ignores a stale identical transition after later transitions advanced the cursor", () => {
    const document = new BoardDocument();
    document.acceptTransition(finalize("a", 1));
    document.acceptTransition(finalize("b", 2));
    document.acceptTransition(undo("a", 3));

    expect(document.acceptTransition(finalize("a", 1))).toEqual({
      type: "duplicate",
      seq: 1,
    });
    expect(document.getCommand("a")).toMatchObject({
      status: "reverted",
      seq: 3,
    });
    expect(document.getHighestContiguousSeq()).toBe(3);
  });

  it("ignores an identical re-delivered buffered transition as a duplicate", () => {
    const document = new BoardDocument();
    document.acceptTransition(finalize("b", 2));

    expect(document.acceptTransition(finalize("b", 2))).toEqual({
      type: "duplicate",
      seq: 2,
    });
    expect(document.getBufferedSequences()).toEqual([2]);

    document.acceptTransition(finalize("a", 1));
    expect(document.getCommand("b")).toBeDefined();
  });

  it("reports sequence-reuse for a contradictory command at a confirmed sequence", () => {
    const document = new BoardDocument();
    document.acceptTransition(finalize("a", 1));
    document.acceptTransition(finalize("b", 2));

    expect(document.acceptTransition(finalize("c", 1))).toEqual({
      type: "protocol-error",
      reason: "sequence-reuse",
    });
    expect(document.getCommand("c")).toBeUndefined();
    expect(document.getHighestContiguousSeq()).toBe(2);
  });

  it("reports sequence-reuse for a changed command value at a confirmed sequence", () => {
    const document = new BoardDocument();
    document.acceptTransition(finalize("a", 1));

    const contradictory: DurableTransition = {
      kind: "finalize",
      commandId: "a",
      command: { ...command("a", 1), timestamp: 2_000 },
      seq: 1,
    };

    expect(document.acceptTransition(contradictory)).toEqual({
      type: "protocol-error",
      reason: "sequence-reuse",
    });
    expect(document.getCommand("a")).toMatchObject({ timestamp: 1_000 });
  });

  it("reports sequence-reuse for a conflicting transition at a buffered sequence", () => {
    const document = new BoardDocument();
    document.acceptTransition(finalize("b", 2));

    expect(document.acceptTransition(finalize("c", 2))).toEqual({
      type: "protocol-error",
      reason: "sequence-reuse",
    });
    expect(document.getBufferedSequences()).toEqual([2]);

    expect(document.acceptTransition(finalize("a", 1))).toMatchObject({
      transitions: [{ seq: 1 }, { seq: 2, commandId: "b" }],
    });
  });
});

describe("BoardDocument transition validation", () => {
  it("rejects undo unless the command is currently applied", () => {
    const fresh = new BoardDocument();
    expect(fresh.acceptTransition(undo("x", 1))).toEqual({
      type: "protocol-error",
      reason: "invalid-transition",
    });

    const pending = documentWith(command("a", undefined, "pending"));
    expect(pending.acceptTransition(undo("a", 1))).toEqual({
      type: "protocol-error",
      reason: "invalid-transition",
    });

    const reverted = new BoardDocument();
    reverted.acceptTransition(finalize("a", 1));
    reverted.acceptTransition(undo("a", 2));
    expect(reverted.acceptTransition(undo("a", 3))).toEqual({
      type: "protocol-error",
      reason: "invalid-transition",
    });
    expect(reverted.getHighestContiguousSeq()).toBe(2);
    expect(reverted.getCommand("a")).toMatchObject({
      status: "reverted",
      seq: 2,
    });
  });

  it("rejects finalize unless the command is unknown or pending", () => {
    const applied = new BoardDocument();
    applied.acceptTransition(finalize("a", 1));
    expect(applied.acceptTransition(finalize("a", 2))).toEqual({
      type: "protocol-error",
      reason: "invalid-transition",
    });

    const reverted = new BoardDocument();
    reverted.acceptTransition(finalize("a", 1));
    reverted.acceptTransition(undo("a", 2));
    expect(reverted.acceptTransition(finalize("a", 3))).toEqual({
      type: "protocol-error",
      reason: "invalid-transition",
    });
    expect(applied.getHighestContiguousSeq()).toBe(1);
  });

  it("rejects redo unless the command is currently reverted", () => {
    const fresh = new BoardDocument();
    expect(fresh.acceptTransition(redo("x", 1))).toEqual({
      type: "protocol-error",
      reason: "invalid-transition",
    });

    const applied = new BoardDocument();
    applied.acceptTransition(finalize("a", 1));
    expect(applied.acceptTransition(redo("a", 2))).toEqual({
      type: "protocol-error",
      reason: "invalid-transition",
    });

    const pending = documentWith(command("a", undefined, "pending"));
    expect(pending.acceptTransition(redo("a", 1))).toEqual({
      type: "protocol-error",
      reason: "invalid-transition",
    });
  });

  it("applies undo to reverted and redo back to applied", () => {
    const document = new BoardDocument();
    document.acceptTransition(finalize("a", 1));

    const undone = document.acceptTransition(undo("a", 2));
    expect(undone).toMatchObject({
      type: "applied",
      transitions: [{ seq: 2, kind: "undo", commandId: "a" }],
    });
    expect(document.getCommand("a")).toMatchObject({
      status: "reverted",
      seq: 2,
    });

    document.acceptTransition(redo("a", 3));
    expect(document.getCommand("a")).toMatchObject({
      status: "applied",
      seq: 3,
    });
    expect(document.getHighestContiguousSeq()).toBe(3);
  });

  it("keeps the applied prefix and freezes when a drained transition fails validation", () => {
    const document = new BoardDocument();
    document.acceptTransition(undo("b", 2));

    const result = document.acceptTransition(finalize("a", 1));
    expect(result).toEqual({
      type: "protocol-error",
      reason: "invalid-transition",
    });
    expect(document.getCommand("a")).toMatchObject({ seq: 1 });
    expect(document.getCommand("b")).toBeUndefined();
    expect(document.getHighestContiguousSeq()).toBe(1);
    expect(document.getBufferedSequences()).toEqual([2]);
  });

  it("finalizes a command that only existed as a preview", () => {
    const document = new BoardDocument();
    document.setPreview(command("a", 1, "pending"));

    expect(document.acceptTransition(finalize("a", 1)).type).toBe("applied");
    expect(document.getCommand("a")).toMatchObject({
      status: "applied",
      seq: 1,
    });
  });
});

describe("BoardDocument previews", () => {
  it("keeps previews out of canonical state and sequence progress", () => {
    const document = new BoardDocument();
    document.setPreview(command("preview"));

    expect(document.getCommands()).toEqual([]);
    expect(document.getHighestContiguousSeq()).toBe(0);
    expect(document.getCommand("preview")).toMatchObject({ id: "preview" });

    document.removePreview("preview");
    expect(document.getCommand("preview")).toBeUndefined();
  });

  it("clears all previews at once", () => {
    const document = new BoardDocument();
    document.setPreview(command("p1"));
    document.setPreview(command("p2"));

    document.clearPreviews();

    expect(document.getCommand("p1")).toBeUndefined();
    expect(document.getCommand("p2")).toBeUndefined();
  });

  it("prefers the canonical command over a stale preview with the same id", () => {
    const document = new BoardDocument();
    document.setPreview(command("a", undefined, "pending"));
    document.acceptTransition(finalize("a", 1));

    expect(document.getCommand("a")).toMatchObject({
      status: "applied",
      seq: 1,
    });
  });
});

describe("BoardDocument installDelta", () => {
  it("infers finalize for unknown applied commands", () => {
    const document = documentWith(command("base", 4));

    const result = document.installDelta([command("a", 5)]);

    expect(result).toEqual({
      type: "applied",
      transitions: [
        {
          seq: 5,
          kind: "finalize",
          commandId: "a",
          command: command("a", 5, "applied"),
        },
      ],
    });
    expect(document.getHighestContiguousSeq()).toBe(5);
  });

  it("infers sequential undo within one delta from status changes", () => {
    const document = documentWith(command("base", 4));

    const result = document.installDelta([
      command("b", 5, "applied"),
      command("b", 6, "reverted"),
    ]);

    expect(result).toMatchObject({
      type: "applied",
      transitions: [
        { seq: 5, kind: "finalize", commandId: "b" },
        { seq: 6, kind: "undo", commandId: "b" },
      ],
    });
    expect(document.getCommand("b")).toMatchObject({
      status: "reverted",
      seq: 6,
    });
    expect(document.getHighestContiguousSeq()).toBe(6);
  });

  it("infers redo for a reverted command applied again", () => {
    const document = documentWith(command("a", 4, "applied"));
    document.installDelta([command("a", 5, "reverted")]);

    const result = document.installDelta([command("a", 6, "applied")]);

    expect(result).toMatchObject({
      type: "applied",
      transitions: [{ seq: 6, kind: "redo", commandId: "a" }],
    });
    expect(document.getCommand("a")).toMatchObject({
      status: "applied",
      seq: 6,
    });
  });

  it("skips delta records that match the current canonical state", () => {
    const document = documentWith(command("a", 4, "applied"));

    const result = document.installDelta([
      command("a", 4, "applied"),
      command("c", 5, "applied"),
    ]);

    expect(result).toMatchObject({
      type: "applied",
      transitions: [{ seq: 5, kind: "finalize", commandId: "c" }],
    });
    expect(document.getHighestContiguousSeq()).toBe(5);
  });

  it("rejects a pending delta record as ambiguous", () => {
    const document = documentWith(command("base", 4));

    expect(document.installDelta([command("a", 5, "pending")])).toEqual({
      type: "protocol-error",
      reason: "ambiguous-delta",
    });
    expect(document.getCommand("a")).toBeUndefined();
  });

  it("rejects an unknown reverted delta record as ambiguous", () => {
    const document = documentWith(command("base", 4));

    expect(document.installDelta([command("x", 5, "reverted")])).toEqual({
      type: "protocol-error",
      reason: "ambiguous-delta",
    });
    expect(document.getCommand("x")).toBeUndefined();
  });

  it("rejects a delta with a sequence gap and rolls back buffering", () => {
    const document = documentWith(command("base", 4));

    expect(document.installDelta([command("a", 6, "applied")])).toEqual({
      type: "protocol-error",
      reason: "ambiguous-delta",
    });
    expect(document.getHighestContiguousSeq()).toBe(4);
    expect(document.getBufferedSequences()).toEqual([]);
    expect(document.getCommand("a")).toBeUndefined();
  });

  it("rolls back partial applications when a later delta record is ambiguous", () => {
    const document = documentWith(command("base", 4));

    const result = document.installDelta([
      command("a", 5, "applied"),
      command("x", 6, "reverted"),
    ]);

    expect(result).toEqual({
      type: "protocol-error",
      reason: "ambiguous-delta",
    });
    expect(document.getCommand("a")).toBeUndefined();
    expect(document.getHighestContiguousSeq()).toBe(4);
    expect(document.getCommands().map((item) => item.id)).toEqual(["base"]);
  });

  it("reconciles buffered live transitions when the delta covers the gap", () => {
    const document = documentWith(command("base", 4));
    expect(document.acceptTransition(finalize("c", 6)).type).toBe("buffered");

    const result = document.installDelta([
      command("b", 5, "applied"),
      command("c", 6, "applied"),
    ]);

    expect(result).toMatchObject({
      type: "applied",
      transitions: [
        { seq: 5, kind: "finalize", commandId: "b" },
        { seq: 6, kind: "finalize", commandId: "c" },
      ],
    });
    expect(document.getHighestContiguousSeq()).toBe(6);
    expect(document.getBufferedSequences()).toEqual([]);
  });

  it("applies no transitions for an empty delta", () => {
    const document = documentWith(command("base", 4));

    expect(document.installDelta([])).toEqual({
      type: "applied",
      transitions: [],
    });
  });
});

describe("BoardDocument replaceCurrentState", () => {
  it("full replacement removes absent state and previews", () => {
    const document = documentWith(command("old", 3));
    document.setPreview(command("preview"));
    document.replaceCurrentState([command("current", 8)]);
    expect(document.getCommands().map((item) => item.id)).toEqual(["current"]);
    expect(document.getHighestContiguousSeq()).toBe(8);
  });

  it("reports removed command ids in deterministic order", () => {
    const document = documentWith(
      command("a", 2),
      command("b", 1),
      command("c", 5),
    );

    const result = document.replaceCurrentState([command("d", 9)]);

    expect(result).toEqual({ removedCommandIds: ["b", "a", "c"] });
  });

  it("trusts the highest baseline without requiring contiguity", () => {
    const document = new BoardDocument();
    document.replaceCurrentState([command("a", 2), command("b", 8)]);

    expect(document.getHighestContiguousSeq()).toBe(8);
    expect(document.getCommands().map((item) => item.id)).toEqual(["a", "b"]);
    expect(document.acceptTransition(finalize("c", 9)).type).toBe("applied");
  });

  it("rejects live transitions at sequences confirmed by replacement", () => {
    const document = new BoardDocument();
    document.replaceCurrentState([command("a", 2), command("b", 8)]);

    expect(document.acceptTransition(finalize("z", 3))).toEqual({
      type: "protocol-error",
      reason: "sequence-reuse",
    });
    expect(document.getCommand("z")).toBeUndefined();
  });

  it("clears buffered transitions and previews on replacement", () => {
    const document = documentWith(command("base", 4));
    document.acceptTransition(finalize("x", 6));
    document.setPreview(command("preview"));

    document.replaceCurrentState([command("n", 7)]);

    expect(document.getBufferedSequences()).toEqual([]);
    expect(document.getCommand("preview")).toBeUndefined();
    expect(document.getHighestContiguousSeq()).toBe(7);
  });

  it("installs the latest materialized status for known commands", () => {
    const document = documentWith(command("a", 2, "applied"));

    document.replaceCurrentState([command("a", 5, "reverted")]);

    expect(document.getCommand("a")).toMatchObject({
      status: "reverted",
      seq: 5,
    });
  });
});

describe("BoardDocument ordering and clear", () => {
  it("orders commands by sequence then id", () => {
    const document = new BoardDocument();
    document.replaceCurrentState([
      command("z", 3),
      command("a", 3),
      command("m", 1),
    ]);

    expect(document.getCommands().map((item) => item.id)).toEqual([
      "m",
      "a",
      "z",
    ]);
  });

  it("orders unsequenced commands ahead of sequenced commands", () => {
    const document = documentWith(command("seq", 2), command("unsequenced"));

    expect(document.getCommands().map((item) => item.id)).toEqual([
      "unsequenced",
      "seq",
    ]);
  });

  it("clear resets canonical state, previews, buffers, and the cursor", () => {
    const document = documentWith(command("a", 4));
    document.setPreview(command("p"));
    document.acceptTransition(finalize("b", 6));
    document.acceptTransition(finalize("c", 5));

    document.clear();

    expect(document.getCommands()).toEqual([]);
    expect(document.getHighestContiguousSeq()).toBe(0);
    expect(document.getBufferedSequences()).toEqual([]);
    expect(document.getCommand("a")).toBeUndefined();
    expect(document.getCommand("p")).toBeUndefined();
    expect(document.acceptTransition(finalize("fresh", 1)).type).toBe(
      "applied",
    );
  });
});
