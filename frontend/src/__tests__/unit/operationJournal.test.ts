import { describe, expect, it } from "vitest";

import {
  MAX_OPERATION_HISTORY,
  OperationJournal,
} from "@/collaboration/operationJournal";
import type { OperationRecord } from "@/types/operations";
import type { RenderableCommand } from "@/types/command";

function command(id: string): RenderableCommand {
  return {
    id,
    type: "stroke",
    payload: {
      nodeId: `node-${id}`,
      points: [0, 0, 12, 14],
      color: "#123abc",
      strokeWidth: 2,
      lineCap: "round",
      lineJoin: "round",
      opacity: 1,
    },
    owner: "user-1",
    status: "applied",
    timestamp: 1_000,
  };
}

function operation(
  operationId: string,
  commandId: string,
): Omit<OperationRecord, "status"> {
  return {
    operationId,
    commandId,
    kind: "finalize",
    previousCanonical: undefined,
    optimisticCanonical: command(commandId),
    deadlineAt: 5_000,
  };
}

function journalWithPending(
  operationId: string,
  commandId: string,
): OperationJournal {
  const journal = new OperationJournal();
  journal.begin(operation(operationId, commandId));
  return journal;
}

describe("OperationJournal begin", () => {
  it("stores the operation as pending and returns the record", () => {
    const journal = new OperationJournal();

    const record = journal.begin(operation("op1", "c1"));

    expect(record).toEqual({
      operationId: "op1",
      commandId: "c1",
      kind: "finalize",
      status: "pending",
      previousCanonical: undefined,
      optimisticCanonical: command("c1"),
      deadlineAt: 5_000,
    });
    expect(journal.findPendingByCommand("c1")).toEqual(record);
  });

  it("throws when another operation is pending for the same command", () => {
    const journal = journalWithPending("op1", "c1");

    expect(() => journal.begin(operation("op2", "c1"))).toThrow();
    expect(journal.findPendingByCommand("c1")?.operationId).toBe("op1");
  });

  it("allows a new operation once the previous one resolved", () => {
    const journal = journalWithPending("op1", "c1");
    journal.acknowledge("op1", 7);

    const record = journal.begin({ ...operation("op2", "c1"), kind: "undo" });

    expect(record.status).toBe("pending");
    expect(journal.findPendingByCommand("c1")?.operationId).toBe("op2");
  });

  it("throws when the operation id already exists", () => {
    const journal = journalWithPending("op1", "c1");

    expect(() => journal.begin(operation("op1", "c2"))).toThrow();
  });
});

describe("OperationJournal acknowledge", () => {
  it("stores the server seq on the acknowledged record", () => {
    const journal = journalWithPending("op1", "c1");

    const resolution = journal.acknowledge("op1", 42);

    expect(resolution).toEqual({
      type: "acknowledged",
      seq: 42,
      record: {
        operationId: "op1",
        commandId: "c1",
        kind: "finalize",
        status: "acknowledged",
        previousCanonical: undefined,
        optimisticCanonical: command("c1"),
        deadlineAt: 5_000,
        seq: 42,
      },
    });
    expect(journal.pending()).toEqual([]);
  });

  it("returns not-found for an unknown operation id", () => {
    const journal = new OperationJournal();

    expect(journal.acknowledge("missing", 1)).toEqual({ type: "not-found" });
  });

  it("acknowledge after reject is already-resolved", () => {
    const journal = journalWithPending("op1", "c1");
    journal.rejectByCommand("c1", "INVALID_COMMAND");

    expect(journal.acknowledge("op1", 42)).toMatchObject({
      type: "already-resolved",
      record: { status: "rejected", operationId: "op1" },
    });
  });
});

describe("OperationJournal rejectByCommand", () => {
  it("resolves ack error and reject event only once", () => {
    const journal = journalWithPending("op1", "c1");
    expect(journal.rejectByCommand("c1", "INVALID_COMMAND").type).toBe(
      "rejected",
    );
    expect(journal.rejectByCommand("c1", "INVALID_COMMAND").type).toBe(
      "already-resolved",
    );
  });

  it("returns the rejected record with the reason and clears pending", () => {
    const journal = journalWithPending("op1", "c1");

    const resolution = journal.rejectByCommand("c1", "INVALID_COMMAND");

    expect(resolution).toEqual({
      type: "rejected",
      reason: "INVALID_COMMAND",
      record: {
        operationId: "op1",
        commandId: "c1",
        kind: "finalize",
        status: "rejected",
        previousCanonical: undefined,
        optimisticCanonical: command("c1"),
        deadlineAt: 5_000,
      },
    });
    expect(journal.pending()).toEqual([]);
  });

  it("reject after acknowledge is already-resolved with the stored seq", () => {
    const journal = journalWithPending("op1", "c1");
    journal.acknowledge("op1", 42);

    expect(journal.rejectByCommand("c1", "INVALID_COMMAND")).toMatchObject({
      type: "already-resolved",
      record: { status: "acknowledged", seq: 42 },
    });
  });

  it("rejects the pending operation, not its resolved predecessor", () => {
    const journal = journalWithPending("op1", "c1");
    journal.acknowledge("op1", 42);
    journal.begin({ ...operation("op2", "c1"), kind: "undo" });

    const resolution = journal.rejectByCommand("c1", "INVALID_COMMAND");

    expect(resolution).toMatchObject({
      type: "rejected",
      record: { operationId: "op2", kind: "undo", status: "rejected" },
    });
  });

  it("returns not-found for an unknown command", () => {
    const journal = new OperationJournal();

    expect(journal.rejectByCommand("missing", "INVALID_COMMAND")).toEqual({
      type: "not-found",
    });
  });
});

describe("OperationJournal markUncertain", () => {
  it("marks timeout uncertain and offers no retry", () => {
    const journal = journalWithPending("op1", "c1");
    expect(journal.markUncertain("op1", "ack-timeout")).toMatchObject({
      type: "uncertain",
      record: { status: "uncertain" },
    });
    expect(journal.pending()).toEqual([]);
  });

  it("returns the uncertain record with the reason and clears pending", () => {
    const journal = journalWithPending("op1", "c1");

    const resolution = journal.markUncertain("op1", "disconnect");

    expect(resolution).toEqual({
      type: "uncertain",
      reason: "disconnect",
      record: {
        operationId: "op1",
        commandId: "c1",
        kind: "finalize",
        status: "uncertain",
        previousCanonical: undefined,
        optimisticCanonical: command("c1"),
        deadlineAt: 5_000,
      },
    });
    expect(journal.findPendingByCommand("c1")).toBeUndefined();
  });

  it("markUncertain after acknowledge is already-resolved", () => {
    const journal = journalWithPending("op1", "c1");
    journal.acknowledge("op1", 42);

    expect(journal.markUncertain("op1", "disconnect")).toMatchObject({
      type: "already-resolved",
      record: { status: "acknowledged" },
    });
  });

  it("uncertain then acknowledge is already-resolved", () => {
    const journal = journalWithPending("op1", "c1");
    journal.markUncertain("op1", "ack-timeout");

    expect(journal.acknowledge("op1", 42)).toMatchObject({
      type: "already-resolved",
      record: { status: "uncertain" },
    });
  });

  it("returns not-found for an unknown operation id", () => {
    const journal = new OperationJournal();

    expect(journal.markUncertain("missing", "disconnect")).toEqual({
      type: "not-found",
    });
  });
});

describe("OperationJournal pending queries", () => {
  it("lists pending operations in begin order", () => {
    const journal = new OperationJournal();
    journal.begin(operation("op1", "c1"));
    journal.begin(operation("op2", "c2"));
    journal.begin(operation("op3", "c3"));
    journal.acknowledge("op2", 5);

    const pending = journal.pending();

    expect(pending.map((record) => record.operationId)).toEqual(["op1", "op3"]);
  });

  it("finds the pending operation for a command", () => {
    const journal = journalWithPending("op1", "c1");

    expect(journal.findPendingByCommand("c1")).toMatchObject({
      operationId: "op1",
      status: "pending",
    });
  });

  it("returns undefined once the operation resolved", () => {
    const journal = journalWithPending("op1", "c1");
    journal.rejectByCommand("c1", "INVALID_COMMAND");

    expect(journal.findPendingByCommand("c1")).toBeUndefined();
  });
});

describe("OperationJournal clear", () => {
  it("empties records and pending state", () => {
    const journal = journalWithPending("op1", "c1");

    journal.clear();

    expect(journal.pending()).toEqual([]);
    expect(journal.findPendingByCommand("c1")).toBeUndefined();
    expect(journal.acknowledge("op1", 42)).toEqual({ type: "not-found" });
    expect(journal.rejectByCommand("c1", "INVALID_COMMAND")).toEqual({
      type: "not-found",
    });
  });

  it("allows beginning operations after clear", () => {
    const journal = journalWithPending("op1", "c1");
    journal.clear();

    const record = journal.begin(operation("op2", "c1"));

    expect(record.status).toBe("pending");
  });
});

describe("OperationJournal resolved history retention", () => {
  it("retains an acknowledged record for duplicate acknowledgement handling", () => {
    const journal = journalWithPending("op1", "c1");

    journal.acknowledge("op1", 42);

    expect(journal.acknowledge("op1", 99)).toMatchObject({
      type: "already-resolved",
      record: {
        operationId: "op1",
        commandId: "c1",
        status: "acknowledged",
        seq: 42,
      },
    });
  });

  it("retains a rejected record for duplicate rejection handling", () => {
    const journal = journalWithPending("op1", "c1");

    journal.rejectByCommand("c1", "INVALID_COMMAND");

    expect(journal.rejectByCommand("c1", "OTHER_REASON")).toMatchObject({
      type: "already-resolved",
      record: {
        operationId: "op1",
        commandId: "c1",
        status: "rejected",
      },
    });
  });

  it("retains an uncertain record for late acknowledgement handling", () => {
    const journal = journalWithPending("op1", "c1");

    journal.markUncertain("op1", "ack-timeout");

    expect(journal.acknowledge("op1", 42)).toMatchObject({
      type: "already-resolved",
      record: {
        operationId: "op1",
        commandId: "c1",
        status: "uncertain",
      },
    });
  });

  it("evicts the oldest resolved record once history exceeds the limit", () => {
    const journal = new OperationJournal();

    for (let i = 0; i <= MAX_OPERATION_HISTORY; i += 1) {
      const operationId = `op${i}`;
      const commandId = `c${i}`;

      journal.begin(operation(operationId, commandId));
      journal.acknowledge(operationId, i);
    }

    expect(journal.acknowledge("op0", 999)).toEqual({
      type: "not-found",
    });

    expect(journal.acknowledge("op1", 999)).toMatchObject({
      type: "already-resolved",
      record: {
        operationId: "op1",
        status: "acknowledged",
        seq: 1,
      },
    });
  });

  it("does not evict pending operations when resolved history is full", () => {
    const journal = new OperationJournal();

    for (let i = 0; i < MAX_OPERATION_HISTORY; i += 1) {
      const operationId = `resolved-op${i}`;
      const commandId = `resolved-c${i}`;

      journal.begin(operation(operationId, commandId));
      journal.acknowledge(operationId, i);
    }

    journal.begin(operation("pending-op", "pending-c"));

    // Resolving one additional operation should evict the oldest
    // resolved record, but must leave the pending operation untouched.
    journal.begin(operation("trigger-op", "trigger-c"));
    journal.acknowledge("trigger-op", MAX_OPERATION_HISTORY);

    expect(journal.findPendingByCommand("pending-c")).toMatchObject({
      operationId: "pending-op",
      status: "pending",
    });

    expect(journal.pending().map((record) => record.operationId)).toContain(
      "pending-op",
    );
  });

  it("keeps latestByCommand pointing to a newer operation when an older operation is evicted", () => {
    const journal = new OperationJournal();

    journal.begin(operation("op1", "c1"));
    journal.acknowledge("op1", 1);

    journal.begin({
      ...operation("op2", "c1"),
      kind: "undo",
    });
    journal.acknowledge("op2", 2);

    // Fill the history until op1 becomes the oldest record and is evicted.
    for (let i = 0; i < MAX_OPERATION_HISTORY - 1; i += 1) {
      const operationId = `filler-op${i}`;
      const commandId = `filler-c${i}`;

      journal.begin(operation(operationId, commandId));
      journal.acknowledge(operationId, i + 10);
    }

    // op1 should now be evicted, but op2 should remain the latest
    // retained record for command c1.
    expect(journal.acknowledge("op1", 999)).toEqual({
      type: "not-found",
    });

    expect(journal.rejectByCommand("c1", "INVALID_COMMAND")).toMatchObject({
      type: "already-resolved",
      record: {
        operationId: "op2",
        commandId: "c1",
        kind: "undo",
        status: "acknowledged",
        seq: 2,
      },
    });
  });

  it("removes latest command mapping when its own latest record is evicted", () => {
    const journal = new OperationJournal();

    journal.begin(operation("op1", "c1"));
    journal.acknowledge("op1", 1);

    for (let i = 0; i < MAX_OPERATION_HISTORY; i += 1) {
      const operationId = `filler-op${i}`;
      const commandId = `filler-c${i}`;

      journal.begin(operation(operationId, commandId));
      journal.acknowledge(operationId, i + 10);
    }

    // op1 was the latest retained record for c1 and should now be gone.
    expect(journal.rejectByCommand("c1", "INVALID_COMMAND")).toEqual({
      type: "not-found",
    });
  });

  it("retains exactly the configured number of resolved records", () => {
    const journal = new OperationJournal();

    for (let i = 0; i < MAX_OPERATION_HISTORY + 1; i += 1) {
      const operationId = `op${i}`;
      const commandId = `c${i}`;

      journal.begin(operation(operationId, commandId));
      journal.acknowledge(operationId, i);
    }

    // The oldest record has been evicted.
    expect(journal.acknowledge("op0", 999)).toEqual({
      type: "not-found",
    });

    // The newest MAX_OPERATION_HISTORY records remain available.
    expect(
      journal.acknowledge(`op${MAX_OPERATION_HISTORY}`, 999),
    ).toMatchObject({
      type: "already-resolved",
      record: {
        operationId: `op${MAX_OPERATION_HISTORY}`,
        status: "acknowledged",
      },
    });
  });

  it("clears resolved history along with records", () => {
    const journal = journalWithPending("op1", "c1");

    journal.acknowledge("op1", 42);
    journal.clear();

    expect(journal.acknowledge("op1", 99)).toEqual({
      type: "not-found",
    });
    expect(journal.rejectByCommand("c1", "INVALID_COMMAND")).toEqual({
      type: "not-found",
    });

    // Confirm the journal can start fresh after clearing its history.
    journal.begin(operation("op2", "c1"));

    expect(journal.findPendingByCommand("c1")).toMatchObject({
      operationId: "op2",
      status: "pending",
    });
  });
});
