/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  io,
  Socket,
  type ManagerOptions,
  type SocketOptions,
} from "socket.io-client";
import { z } from "zod";
import type { ClientEmitEvents, ClientListenEvents } from "@/types/events";
import { parseProtocol } from "@/collaboration/schemas";
import { type AckErrorCategory } from "@/types/collaboration";

/** Default acknowledgement deadline shared by join and durable commands. */
export const ACK_DEADLINE_MS = 8_000;

/** Raised when an acknowledgement is not received within the deadline.
 * Rejection raised by {@link ConnectionManager.emitWithAck}. */
export class AckError extends Error {
  readonly category: AckErrorCategory;
  readonly event: string;

  constructor(
    event: string,
    category: AckErrorCategory,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AckError";
    this.event = event;
    this.category = category;
  }
}

/** Inbound event arguments failed protocol validation.
 * Raised when inbound event arguments fail protocol validation.
 */
export class ProtocolValidationError extends Error {
  readonly event: string;
  readonly schemaName: string;

  constructor(event: string, schemaName: string, error: z.ZodError) {
    super(
      `Protocol validation failed for "${event}" against schema "${schemaName}"`,
      { cause: error },
    );
    this.name = "ProtocolValidationError";
    this.event = event;
    this.schemaName = schemaName;
  }
}

export class ConnectionManager {
  private socket: Socket;

  constructor(url: string, options?: Partial<ManagerOptions & SocketOptions>) {
    this.socket = io(url, {
      autoConnect: false,
      withCredentials: true,
      ...options,
      // Manager-level retries stay disabled; durability decisions belong to
      // the collaboration layer, which never re-emits durable operations.
      retries: 0,
    });
  }

  connect() {
    this.socket.connect();
  }

  disconnect() {
    this.cleanup();
    this.socket.disconnect();
  }

  cleanup() {
    this.socket.removeAllListeners();
  }

  onConnect(handler: () => void): void {
    this.socket.on("connect", handler);
  }

  /**
   * Merge new values into the auth handshake payload used by the next
   * connect or reconnect. Never connects or disconnects on its own.
   */
  setAuth(auth: Record<string, unknown>): void {
    this.socket.auth = { ...this.socket.auth, ...auth };
  }

  /**
   * Subscribe to socket lifecycle events. Returns an unsubscribe function
   * that removes only the handlers registered by this call.
   */
  subscribeLifecycle(handlers: {
    connect?: () => void;
    disconnect?: (reason: string) => void;
    connectError?: (error: Error) => void;
  }): () => void {
    const registrations: Array<{
      event: string;
      handler: (...args: any[]) => void;
    }> = [];

    if (handlers.connect) {
      registrations.push({ event: "connect", handler: handlers.connect });
    }
    if (handlers.disconnect) {
      registrations.push({
        event: "disconnect",
        handler: handlers.disconnect as any,
      });
    }
    if (handlers.connectError) {
      registrations.push({
        event: "connect_error",
        handler: handlers.connectError as any,
      });
    }

    for (const { event, handler } of registrations) {
      this.socket.on(event, handler);
    }

    return () => {
      for (const { event, handler } of registrations) {
        this.socket.off(event, handler);
      }
    };
  }

  /**
   * Register an inbound event handler that only runs when the event
   * arguments satisfy the provided schema. Invalid payloads are reported
   * through {@link onProtocolError} and never reach the handler.
   */
  onValidated<TArgs extends readonly unknown[]>(
    event: keyof ClientListenEvents & string,
    schemaName: string,
    schema: z.ZodType<TArgs>,
    handler: (...args: TArgs) => void,
    onProtocolError: (error: ProtocolValidationError) => void,
  ): () => void {
    const listener = (...args: unknown[]): void => {
      const parsed = parseProtocol(schemaName, schema, args);
      if (parsed.success) {
        handler(...parsed.data);
        return;
      }
      onProtocolError(
        new ProtocolValidationError(event, schemaName, parsed.error),
      );
    };

    this.socket.on(event, listener as any);

    return () => {
      this.socket.off(event, listener as any);
    };
  }

  /** Fire-and-forget emission that may be dropped while disconnected. */
  emitVolatile<TEvent extends keyof ClientEmitEvents & string>(
    event: TEvent,
    ...args: Parameters<ClientEmitEvents[TEvent]>
  ): void {
    this.socket.volatile.emit(event, ...args);
  }

  /**
   * Emit an event and await its acknowledgement, rejecting with an
   * {@link AckError} on timeout, server error, or malformed response.
   */
  emitWithAck<T>(
    event: string,
    payload: unknown,
    schema: z.ZodType<T>,
    timeoutMs: number = ACK_DEADLINE_MS,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;

      const deadline = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(
          new AckError(
            event,
            "timeout",
            `Acknowledgement deadline of ${timeoutMs} ms expired for "${event}"`,
          ),
        );
      }, timeoutMs);

      const onAcknowledgement = (err?: unknown, resp?: unknown): void => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);

        if (err) {
          reject(
            new AckError(event, "server", `Server rejected "${event}"`, {
              cause: err,
            }),
          );
          return;
        }

        const parsed = parseProtocol(event, schema, resp);
        if (parsed.success) {
          resolve(parsed.data);
          return;
        }
        reject(
          new AckError(
            event,
            "protocol",
            `Malformed acknowledgement for "${event}"`,
            { cause: parsed.error },
          ),
        );
      };

      this.socket.emit(event, payload, onAcknowledgement as any);
    });
  }

  emit<TEvent extends keyof ClientEmitEvents & string>(
    event: TEvent,
    ...args: Parameters<ClientEmitEvents[TEvent]>
  ) {
    this.socket.emit(event, ...args);
  }

  on<TEvent extends keyof ClientListenEvents & string>(
    event: TEvent,
    handler: ClientListenEvents[TEvent],
  ) {
    this.socket.on(event, handler as any);
  }

  off<TEvent extends keyof ClientListenEvents & string>(
    event: TEvent,
    handler: ClientListenEvents[TEvent],
  ) {
    this.socket.off(event, handler as any);
  }

  once<TEvent extends keyof ClientListenEvents & string>(
    event: TEvent,
    handler: ClientListenEvents[TEvent],
  ) {
    this.socket.once(event, handler as any);
  }
}
