/**
 * Tracks the single active board session epoch.
 *
 * The board provider registers one handle per session epoch (one per
 * room mount or identity change). Registering a new handle disposes the
 * previously registered epoch before replacing it, so at most one
 * epoch is ever active even if a stale effect failed to clean itself
 * up. This is the logout integration boundary consumed by Plan 2; it
 * deliberately exposes no sockets or managers — only epoch-scoped
 * disposal.
 */
export interface SessionHandle {
  epoch: string;
  dispose(): void;
}

export interface ActiveSessionSlot {
  /**
   * Makes `handle` the active epoch, disposing any previously
   * registered epoch first. Returns an unregister callback that
   * removes the handle only while it is still current.
   */
  register(handle: SessionHandle): () => void;

  /** Disposes and clears the current handle exactly once (idempotent). */
  disposeActive(): void;
}

export class ActiveSessionSlotImpl implements ActiveSessionSlot {
  private current: SessionHandle | null = null;

  register(handle: SessionHandle): () => void {
    this.disposeCurrent();

    this.current = handle;

    return () => {
      if (this.current === handle) {
        this.current = null;
      }
    };
  }

  disposeActive(): void {
    this.disposeCurrent();
  }

  private disposeCurrent(): void {
    const handle = this.current;
    if (!handle) {
      return;
    }
    // Clear before disposing so a disposing callback that re-enters the
    // registry can never observe itself as current.
    this.current = null;
    handle.dispose();
  }
}

export const activeBoardSessionSlot: ActiveSessionSlot =
  new ActiveSessionSlotImpl();
