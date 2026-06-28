import { describe, it, expect } from "vitest";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import { port } from "./setup.js";

function connectClient(): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioc(`http://localhost:${port}`, {
      transports: ["websocket"],
      forceNew: true,
    });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (err) => reject(err));
    setTimeout(() => reject(new Error("connection timeout")), 3000);
  });
}

describe("Socket.IO connection", () => {
  it("client can connect and disconnect", async () => {
    const socket = await connectClient();
    expect(socket.connected).toBe(true);

    await new Promise<void>((resolve) => {
      socket.on("disconnect", () => resolve());
      socket.disconnect();
    });
  });

  it("multiple clients can connect", async () => {
    const socket1 = await connectClient();
    const socket2 = await connectClient();

    expect(socket1.connected).toBe(true);
    expect(socket2.connected).toBe(true);

    socket1.disconnect();
    socket2.disconnect();
  });
});
