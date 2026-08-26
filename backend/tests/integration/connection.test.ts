import { describe, it, expect } from "vitest";
import { connectClient } from "./helpers.js";

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
