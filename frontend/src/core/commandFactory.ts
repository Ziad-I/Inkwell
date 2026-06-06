import type {
  Command,
  CommandOf,
  CommandPayloadMap,
  CommandStatus,
  CommandType,
} from "@/types/command";
import type { StageOperations } from "@/types/common";
import type { BaseCommand } from "@/commands/baseCommand";
import { generateId } from "@/lib/utils";
import { StrokeCommand } from "@/commands/strokeCommand";
import { ShapeCommand } from "@/commands/shapeCommand";
import { EraseCommand } from "@/commands/eraseCommand";
import { TransformCommand } from "@/commands/transformCommand";

/**
 * Factory class for creating command instances from command data
 */
export class CommandFactory {
  /**
   * Create a command instance from command data
   */
  createCommand<T extends CommandType>(
    type: T,
    payload: CommandPayloadMap[T],
    owner: string,
    status: CommandStatus = "pending",
    timestamp: number = Date.now(),
  ): CommandOf<T> {
    const id = generateId();

    const base = {
      id,
      type,
      payload,
      owner,
      status,
      timestamp,
    };

    // TS: assert the narrowed return type
    return base as unknown as CommandOf<T>;
  }

  createInstance(operation: Command, stageOps: StageOperations): BaseCommand {
    switch (operation.type) {
      case "stroke":
        return new StrokeCommand(operation, stageOps);
      case "shape":
        return new ShapeCommand(operation, stageOps);
      case "erase":
        return new EraseCommand(operation, stageOps);
      case "transform":
        return new TransformCommand(operation, stageOps);
      case "tombstone":
        throw new Error("TombstoneCommand not yet implemented");
      case "restore":
        throw new Error("RestoreCommand not yet implemented");
      default:
        throw new Error(
          `Unknown operation type: ${(operation as Command).type}`
        );
    }
  }
}
