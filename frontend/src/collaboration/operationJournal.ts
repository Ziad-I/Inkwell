import type { CommandID } from "@/types/command";
import type { UncertainReason } from "@/types/operations";
import type { OperationRecord } from "@/types/operations";
import type { OperationResolution } from "@/types/operations";

/**
 * Maximum number of resolved operation records retained for handling
 * late/duplicate acknowledgements and rejections.
 *
 * Pending operations are not subject to this limit.
 */
export const MAX_OPERATION_HISTORY = 100;

export class OperationJournal {
  private records = new Map<string, OperationRecord>();
  private pendingByCommand = new Map<CommandID, string>();
  private latestByCommand = new Map<CommandID, string>();

  /**
   * Resolved operation IDs retained in resolution order.
   *
   * This is intentionally separate from `records` because pending operations
   * must never be evicted merely because the resolved history is full.
   */
  private resolvedHistory: string[] = [];

  begin(record: Omit<OperationRecord, "status">): OperationRecord {
    if (this.records.has(record.operationId)) {
      throw new Error(`Operation ${record.operationId} already exists`);
    }

    const pendingOperationId = this.pendingByCommand.get(record.commandId);
    if (pendingOperationId !== undefined) {
      throw new Error(
        `Command ${record.commandId} already has pending operation ${pendingOperationId}`,
      );
    }

    const stored: OperationRecord = {
      ...record,
      status: "pending",
    };

    this.records.set(stored.operationId, stored);
    this.pendingByCommand.set(stored.commandId, stored.operationId);
    this.latestByCommand.set(stored.commandId, stored.operationId);

    return { ...stored };
  }

  acknowledge(operationId: string, seq: number): OperationResolution {
    return this.resolve(this.records.get(operationId), (record) => {
      record.status = "acknowledged";
      record.seq = seq;
      this.pendingByCommand.delete(record.commandId);

      return { type: "acknowledged", record: { ...record }, seq };
    });
  }

  rejectByCommand(commandId: CommandID, reason: string): OperationResolution {
    const operationId =
      this.pendingByCommand.get(commandId) ??
      this.latestByCommand.get(commandId);

    return this.resolve(
      operationId === undefined ? undefined : this.records.get(operationId),
      (record) => {
        record.status = "rejected";
        this.pendingByCommand.delete(record.commandId);

        return { type: "rejected", record: { ...record }, reason };
      },
    );
  }

  markUncertain(
    operationId: string,
    reason: UncertainReason,
  ): OperationResolution {
    return this.resolve(this.records.get(operationId), (record) => {
      record.status = "uncertain";
      this.pendingByCommand.delete(record.commandId);

      return { type: "uncertain", record: { ...record }, reason };
    });
  }

  findPendingByCommand(commandId: CommandID): OperationRecord | undefined {
    const operationId = this.pendingByCommand.get(commandId);

    if (operationId === undefined) {
      return undefined;
    }

    const record = this.records.get(operationId);

    return record === undefined ? undefined : { ...record };
  }

  pending(): readonly OperationRecord[] {
    return [...this.records.values()]
      .filter((record) => record.status === "pending")
      .map((record) => ({ ...record }));
  }

  clear(): void {
    this.records.clear();
    this.pendingByCommand.clear();
    this.latestByCommand.clear();
    this.resolvedHistory = [];
  }

  private resolve(
    record: OperationRecord | undefined,
    finish: (record: OperationRecord) => OperationResolution,
  ): OperationResolution {
    if (record === undefined) {
      return { type: "not-found" };
    }

    if (record.status !== "pending") {
      return {
        type: "already-resolved",
        record: { ...record },
      };
    }

    const resolution = finish(record);
    this.retainResolved(record.operationId);
    return resolution;
  }

  /**
   * Retain a resolved operation long enough to classify late/duplicate
   * acknowledgements and rejections, while preventing unbounded growth.
   *
   * Called once, from `resolve()`, after `finish()` has transitioned a
   * record out of "pending" — so every current and future resolution path
   * (acknowledge, rejectByCommand, markUncertain, or anything added later)
   * is tracked automatically without needing its own call site.
   */
  private retainResolved(operationId: string): void {
    this.resolvedHistory.push(operationId);

    while (this.resolvedHistory.length > MAX_OPERATION_HISTORY) {
      const evictedId = this.resolvedHistory.shift();

      if (evictedId === undefined) {
        break;
      }

      const evicted = this.records.get(evictedId);
      this.records.delete(evictedId);

      // Only remove latestByCommand if it still points at the evicted record.
      // A newer operation for the same command may already have replaced it.
      if (
        evicted !== undefined &&
        this.latestByCommand.get(evicted.commandId) === evictedId
      ) {
        this.latestByCommand.delete(evicted.commandId);
      }
    }
  }
}
