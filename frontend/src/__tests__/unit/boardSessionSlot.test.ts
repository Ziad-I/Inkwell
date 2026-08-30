import { describe, it, expect, vi } from "vitest";
import {
  ActiveSessionSlotImpl,
  activeBoardSessionSlot,
} from "@/collaboration/sessionSlot";

function makeHandle(epoch: string) {
  return { epoch, dispose: vi.fn() };
}

describe("ActiveBoardSessionRegistry", () => {
  it("registering a new handle disposes the previously registered epoch exactly once", () => {
    const registry = new ActiveSessionSlotImpl();
    const first = makeHandle("gen-1");
    const second = makeHandle("gen-2");

    registry.register(first);
    registry.register(second);

    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.dispose).not.toHaveBeenCalled();
  });

  it("disposeActive disposes and clears the current handle exactly once", () => {
    const registry = new ActiveSessionSlotImpl();
    const handle = makeHandle("gen-1");
    registry.register(handle);

    registry.disposeActive();
    registry.disposeActive();

    expect(handle.dispose).toHaveBeenCalledTimes(1);
  });

  it("disposeActive is a no-op when no handle is registered", () => {
    const registry = new ActiveSessionSlotImpl();

    expect(() => registry.disposeActive()).not.toThrow();
  });

  it("unregister removes the handle only while it is current", () => {
    const registry = new ActiveSessionSlotImpl();
    const handle = makeHandle("gen-1");
    const unregister = registry.register(handle);

    unregister();

    // The handle was removed without being disposed; disposeActive must not
    // invoke its dispose callback.
    registry.disposeActive();
    expect(handle.dispose).not.toHaveBeenCalled();
  });

  it("a stale unregister callback cannot remove a newer handle", () => {
    const registry = new ActiveSessionSlotImpl();
    const first = makeHandle("gen-1");
    const second = makeHandle("gen-2");
    const unregisterFirst = registry.register(first);
    registry.register(second);

    unregisterFirst();
    registry.disposeActive();

    expect(second.dispose).toHaveBeenCalledTimes(1);
  });

  it("registering after disposeActive does not re-dispose the old handle", () => {
    const registry = new ActiveSessionSlotImpl();
    const first = makeHandle("gen-1");
    const second = makeHandle("gen-2");
    registry.register(first);
    registry.disposeActive();

    registry.register(second);

    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.dispose).not.toHaveBeenCalled();
  });

  it("exports a singleton instance of the registry", () => {
    expect(activeBoardSessionSlot).toBeInstanceOf(ActiveSessionSlotImpl);
  });
});
