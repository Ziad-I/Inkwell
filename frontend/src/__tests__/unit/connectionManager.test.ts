import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { io } from "socket.io-client";
import { z } from "zod";
import {
  durableAckSchema,
  presenceMoveArgsSchema,
} from "@/collaboration/schemas";
import { ConnectionManager } from "@/core/connectionManager";
import {
  getLastMockSocket,
  serverAck,
  serverEmit,
} from "@/__tests__/mocks/socket-io";

const SOCKET_URL = "http://localhost:3000";

function createManager(): ConnectionManager {
  return new ConnectionManager(SOCKET_URL);
}

describe("ConnectionManager", () => {
  describe("construction", () => {
    it("configures socket.io without auto-connect and with retries disabled", () => {
      createManager();
      expect(vi.mocked(io)).toHaveBeenCalledWith(
        SOCKET_URL,
        expect.objectContaining({
          autoConnect: false,
          withCredentials: true,
          retries: 0,
        }),
      );
    });

    it("forwards emit calls to the socket", () => {
      const manager = createManager();
      manager.emit("command:cancel", { id: "c1" });
      expect(getLastMockSocket().emit).toHaveBeenCalledWith(
        "command:cancel",
        { id: "c1" },
      );
    });

    it("removes registered listeners on disconnect", () => {
      const manager = createManager();
      const handler = vi.fn();
      manager.on("presence:move", handler);
      manager.disconnect();
      serverEmit("presence:move", "u1", { x: 1, y: 2 });
      expect(handler).not.toHaveBeenCalled();
      expect(getLastMockSocket().disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe("onValidated", () => {
    it("delivers schema-valid arguments to the application handler", () => {
      const manager = createManager();
      const handler = vi.fn();
      manager.onValidated(
        "presence:move",
        "presenceMove",
        presenceMoveArgsSchema,
        handler,
        vi.fn(),
      );

      serverEmit("presence:move", "u1", { x: 1, y: 2 });

      expect(handler).toHaveBeenCalledWith("u1", { x: 1, y: 2 });
    });

    it("does not invoke application code for invalid arguments", () => {
      const manager = createManager();
      const handler = vi.fn();
      const protocolError = vi.fn();
      manager.onValidated(
        "presence:move",
        "presenceMove",
        presenceMoveArgsSchema,
        handler,
        protocolError,
      );

      serverEmit("presence:move", "u1", { x: Number.NaN, y: 2 });

      expect(handler).not.toHaveBeenCalled();
      expect(protocolError).toHaveBeenCalledTimes(1);
    });

    it("does not invoke application code when arguments are missing", () => {
      const manager = createManager();
      const handler = vi.fn();
      const protocolError = vi.fn();
      manager.onValidated(
        "presence:move",
        "presenceMove",
        presenceMoveArgsSchema,
        handler,
        protocolError,
      );

      serverEmit("presence:move", "u1");

      expect(handler).not.toHaveBeenCalled();
      expect(protocolError).toHaveBeenCalledTimes(1);
    });

    it("reports the event, schema name, and issues on protocol errors", () => {
      const manager = createManager();
      const protocolError = vi.fn();
      manager.onValidated(
        "presence:move",
        "presenceMove",
        presenceMoveArgsSchema,
        vi.fn(),
        protocolError,
      );

      serverEmit("presence:move", "u1", { x: Number.NaN, y: 2 });

      expect(protocolError).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "presence:move",
          schemaName: "presenceMove",
        }),
      );
      const error = protocolError.mock.calls[0][0] as { cause: unknown };
      expect(error.cause).toBeInstanceOf(z.ZodError);
    });

    it("stops delivering events after unsubscribe", () => {
      const manager = createManager();
      const handler = vi.fn();
      const unsubscribe = manager.onValidated(
        "presence:move",
        "presenceMove",
        presenceMoveArgsSchema,
        handler,
        vi.fn(),
      );

      unsubscribe();
      serverEmit("presence:move", "u1", { x: 1, y: 2 });

      expect(handler).not.toHaveBeenCalled();
    });

    it("unsubscribe removes only its own validated listener", () => {
      const manager = createManager();
      const first = vi.fn();
      const second = vi.fn();
      const unsubscribeFirst = manager.onValidated(
        "presence:move",
        "presenceMove",
        presenceMoveArgsSchema,
        first,
        vi.fn(),
      );
      manager.onValidated(
        "presence:move",
        "presenceMove",
        presenceMoveArgsSchema,
        second,
        vi.fn(),
      );

      unsubscribeFirst();
      serverEmit("presence:move", "u1", { x: 1, y: 2 });

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledWith("u1", { x: 1, y: 2 });
    });
  });

  describe("emitWithAck", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("resolves with the parsed acknowledgement", async () => {
      const manager = createManager();
      const result = manager.emitWithAck(
        "command:undo",
        { id: "c1" },
        durableAckSchema,
      );

      serverAck("command:undo", undefined, { seq: 4 });

      await expect(result).resolves.toEqual({ seq: 4 });
    });

    it("rejects malformed acknowledgements as protocol errors", async () => {
      const manager = createManager();
      const result = manager.emitWithAck(
        "command:undo",
        { id: "c1" },
        durableAckSchema,
      );

      serverAck("command:undo", undefined, { seq: 2.5 });

      await expect(result).rejects.toMatchObject({
        category: "protocol",
        event: "command:undo",
      });
    });

    it("rejects when the server acknowledges an error", async () => {
      const manager = createManager();
      const result = manager.emitWithAck(
        "command:undo",
        { id: "c1" },
        durableAckSchema,
      );

      serverAck("command:undo", "NOT_IN_ROOM");

      await expect(result).rejects.toMatchObject({
        category: "server",
        event: "command:undo",
        cause: "NOT_IN_ROOM",
      });
    });

    it("times out acknowledgements at eight seconds", async () => {
      const manager = createManager();
      const result = manager.emitWithAck(
        "command:undo",
        { id: "c1" },
        durableAckSchema,
      );
      let settled = false;
      void result.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );

      await vi.advanceTimersByTimeAsync(7_999);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
      await expect(result).rejects.toMatchObject({
        category: "timeout",
        event: "command:undo",
      });
    });

    it("honors a custom acknowledgement deadline", async () => {
      const manager = createManager();
      const result = manager.emitWithAck(
        "command:undo",
        { id: "c1" },
        durableAckSchema,
        2_500,
      );
      let settled = false;
      void result.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );

      await vi.advanceTimersByTimeAsync(2_499);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
      await expect(result).rejects.toMatchObject({ category: "timeout" });
    });

    it("clears the deadline timer once acknowledged", async () => {
      const manager = createManager();
      const result = manager.emitWithAck(
        "command:undo",
        { id: "c1" },
        durableAckSchema,
      );
      expect(vi.getTimerCount()).toBe(1);

      serverAck("command:undo", undefined, { seq: 4 });

      await expect(result).resolves.toEqual({ seq: 4 });
      expect(vi.getTimerCount()).toBe(0);
    });

    it("ignores duplicate acknowledgements after settling", async () => {
      const manager = createManager();
      const result = manager.emitWithAck(
        "command:undo",
        { id: "c1" },
        durableAckSchema,
      );

      serverAck("command:undo", undefined, { seq: 4 });
      serverAck("command:undo", undefined, { seq: 5 });

      await expect(result).resolves.toEqual({ seq: 4 });
    });

    it("ignores acknowledgements that arrive after the deadline", async () => {
      const manager = createManager();
      const result = manager.emitWithAck(
        "command:undo",
        { id: "c1" },
        durableAckSchema,
      );
      let rejection: unknown;
      void result.then(
        () => {},
        (error: unknown) => {
          rejection = error;
        },
      );

      await vi.advanceTimersByTimeAsync(8_000);
      expect(rejection).toMatchObject({ category: "timeout" });

      serverAck("command:undo", undefined, { seq: 9 });
      expect(rejection).toMatchObject({ category: "timeout" });
    });
  });

  describe("setAuth", () => {
    it("updates socket auth without connecting or disconnecting", () => {
      const manager = createManager();
      manager.setAuth({ token: "token-2" });
      const socket = getLastMockSocket();

      expect(socket.auth).toEqual({ token: "token-2" });
      expect(socket.connect).not.toHaveBeenCalled();
      expect(socket.disconnect).not.toHaveBeenCalled();

      manager.setAuth({ userId: "u1" });
      expect(socket.auth).toEqual({ token: "token-2", userId: "u1" });
      expect(socket.connect).not.toHaveBeenCalled();
      expect(socket.disconnect).not.toHaveBeenCalled();
    });
  });

  describe("emitVolatile", () => {
    it("emits presence moves through the volatile channel", () => {
      const manager = createManager();
      manager.emitVolatile("presence:move", { pos: { x: 4, y: 5 } });
      const socket = getLastMockSocket();

      expect(socket.volatile.emit).toHaveBeenCalledWith("presence:move", {
        pos: { x: 4, y: 5 },
      });
      expect(socket.emit).not.toHaveBeenCalled();
    });
  });

  describe("subscribeLifecycle", () => {
    it("dispatches connect, disconnect, and connect_error events", () => {
      const manager = createManager();
      const onConnect = vi.fn();
      const onDisconnect = vi.fn();
      const onConnectError = vi.fn();
      manager.subscribeLifecycle({
        connect: onConnect,
        disconnect: onDisconnect,
        connectError: onConnectError,
      });

      serverEmit("connect");
      serverEmit("disconnect", "transport close");
      const failure = new Error("handshake failed");
      serverEmit("connect_error", failure);

      expect(onConnect).toHaveBeenCalledTimes(1);
      expect(onDisconnect).toHaveBeenCalledWith("transport close");
      expect(onConnectError).toHaveBeenCalledWith(failure);
    });

    it("unsubscribe removes only its own handlers", () => {
      const manager = createManager();
      const firstConnect = vi.fn();
      const secondConnect = vi.fn();
      const unsubscribeFirst = manager.subscribeLifecycle({
        connect: firstConnect,
      });
      manager.subscribeLifecycle({ connect: secondConnect });

      unsubscribeFirst();
      serverEmit("connect");

      expect(firstConnect).not.toHaveBeenCalled();
      expect(secondConnect).toHaveBeenCalledTimes(1);
    });
  });
});
