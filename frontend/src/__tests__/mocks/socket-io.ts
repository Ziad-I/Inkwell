import { vi, type Mock } from "vitest";

export type SocketAck = (err?: unknown, resp?: unknown) => void;

type Handler = (...args: unknown[]) => void;

export interface MockSocket {
  on: Mock<(event: string, handler: Handler) => MockSocket>;
  off: Mock<(event: string, handler: Handler) => MockSocket>;
  once: Mock<(event: string, handler: Handler) => MockSocket>;
  emit: Mock<(event: string, ...args: unknown[]) => MockSocket>;
  connect: Mock<() => MockSocket>;
  disconnect: Mock<() => MockSocket>;
  close: Mock<() => MockSocket>;
  removeAllListeners: Mock<() => MockSocket>;
  volatile: { emit: Mock<(event: string, ...args: unknown[]) => void> };
  io: { on: Mock<(event: string, handler: Handler) => void> };
  auth: Record<string, unknown>;
  id: string;
  connected: boolean;
}

const handlerRegistries = new WeakMap<MockSocket, Map<string, Handler[]>>();
const ackQueues = new WeakMap<MockSocket, Map<string, SocketAck[]>>();
let lastSocket: MockSocket | undefined;

function addHandler(socket: MockSocket, event: string, handler: Handler): void {
  const registry = handlerRegistries.get(socket) ?? new Map();
  const handlers = registry.get(event) ?? [];
  handlers.push(handler);
  registry.set(event, handlers);
  handlerRegistries.set(socket, registry);
}

function removeHandler(
  socket: MockSocket,
  event: string,
  handler: Handler,
): void {
  const handlers = handlerRegistries.get(socket)?.get(event);
  if (!handlers) return;
  const index = handlers.indexOf(handler);
  if (index !== -1) handlers.splice(index, 1);
}

function addAck(socket: MockSocket, event: string, ack: SocketAck): void {
  const queue = ackQueues.get(socket) ?? new Map();
  const acks = queue.get(event) ?? [];
  acks.push(ack);
  queue.set(event, acks);
  ackQueues.set(socket, queue);
}

export function createMockSocket(): MockSocket {
  const socket: MockSocket = {
    on: vi.fn((event: string, handler: Handler) => {
      addHandler(socket, event, handler);
      return socket;
    }),
    off: vi.fn((event: string, handler: Handler) => {
      removeHandler(socket, event, handler);
      return socket;
    }),
    once: vi.fn((event: string, handler: Handler) => {
      const onceHandler: Handler = (...args: unknown[]) => {
        removeHandler(socket, event, onceHandler);
        handler(...args);
      };
      addHandler(socket, event, onceHandler);
      return socket;
    }),
    emit: vi.fn((event: string, ...args: unknown[]) => {
      const ack = args[args.length - 1];
      if (typeof ack === "function") {
        addAck(socket, event, ack as SocketAck);
      }
      return socket;
    }),
    connect: vi.fn(() => socket),
    disconnect: vi.fn(() => socket),
    close: vi.fn(() => socket),
    removeAllListeners: vi.fn(() => {
      handlerRegistries.get(socket)?.clear();
      ackQueues.get(socket)?.clear();
      return socket;
    }),
    volatile: {
      emit: vi.fn((_event: string, ..._args: unknown[]) => undefined),
    },
    io: {
      on: vi.fn((_event: string, _handler: Handler) => undefined),
    },
    auth: {},
    id: "mock-socket-id",
    connected: true,
  };

  handlerRegistries.set(socket, new Map());
  ackQueues.set(socket, new Map());
  lastSocket = socket;
  return socket;
}

export function getLastMockSocket(): MockSocket {
  if (!lastSocket) {
    throw new Error("io() has not been called; no mock socket exists yet");
  }
  return lastSocket;
}

/**
 * Recorded client emissions for `event` on a specific socket, in order.
 * Each entry is the full argument list after the event name.
 */
export function socketEmissions(
  socket: MockSocket,
  event: string,
): unknown[][] {
  return socket.emit.mock.calls.filter((call) => call[0] === event);
}

/**
 * Dispatch a server-sent event to every handler registered on the most
 * recently created mock socket.
 */
export function serverEmit(event: string, ...args: unknown[]): void {
  const socket = getLastMockSocket();
  const handlers = [...(handlerRegistries.get(socket)?.get(event) ?? [])];
  for (const handler of handlers) {
    handler(...args);
  }
}

/**
 * Invoke the most recent acknowledgement callback captured for `event` on
 * the most recently created mock socket, mirroring the err-first ack
 * convention (`ack(err, resp)` / `ack(undefined, resp)`).
 */
export function serverAck(event: string, err?: unknown, resp?: unknown): void {
  const socket = getLastMockSocket();
  const acks = ackQueues.get(socket)?.get(event) ?? [];
  const ack = acks[acks.length - 1];
  if (!ack) {
    throw new Error(`no pending acknowledgement captured for "${event}"`);
  }
  ack(err, resp);
}

vi.mock("socket.io-client", () => ({
  io: vi.fn((_url?: string, _options?: Record<string, unknown>) =>
    createMockSocket(),
  ),
  Socket: vi.fn(),
}));
