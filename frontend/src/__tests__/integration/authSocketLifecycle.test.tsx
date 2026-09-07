import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { io } from "socket.io-client";

import { apiClient } from "@/api/client";
import { installAuthInterceptors } from "@/api/interceptors";
import { refreshSession } from "@/api/session";
import { BoardManagersProvider } from "@/providers/managersProvider";
import authApi from "@/api/auth";
import { useAuthStore } from "@/stores/authStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useToolStore } from "@/stores/toolStore";

import type { StageOperations } from "@/types/common";

import {
  serverAck,
  serverEmit,
  socketEmissions,
  type MockSocket,
} from "@/__tests__/mocks/socket-io";

import {
  installHttpAdapter,
  resetAuthStore,
  sessionWith,
  type HttpAdapterHarness,
} from "../helpers/httpClient";

import { flushAsync } from "../helpers/httpClient";

const SOCKET_URL = "http://localhost:3000";

// ---------------------------------------------------------------------------
// Real HTTP interceptor stack
// ---------------------------------------------------------------------------

/*
 * Install the production interceptor stack on the shared apiClient so this
 * test exercises the same HTTP pipeline used by the application.
 */
installAuthInterceptors(apiClient, refreshSession);

// ---------------------------------------------------------------------------
// Tool loaders
// ---------------------------------------------------------------------------

/**
 * These tests exercise the auth lifecycle, not deferred initialization, so
 * the tool loaders resolve immediately instead of gating.
 */
vi.mock("@/core/toolLoaders", () => {
  const ids = ["brush", "eraser", "shapes", "selection"];

  const loaders: Record<
    string,
    { eager: boolean; load: () => Promise<unknown> }
  > = {};

  for (const id of ids) {
    loaders[id] = {
      eager: true,
      load: async () => ({
        meta: { id },
        onActivate: vi.fn(),
        onDeactivate: vi.fn(),
      }),
    };
  }

  return { toolLoaders: loaders };
});

const toastMock = vi.hoisted(() => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock("sonner", () => toastMock);

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function createStageOperationsFake() {
  const fake = {
    getStage: vi.fn(() => null),
    getScale: vi.fn(() => 1),
    getViewpointPos: vi.fn(() => ({ x: 0, y: 0 })),
    getDrawingLayer: vi.fn(() => null),
    getOverlayLayer: vi.fn(() => null),

    createNode: vi.fn(
      (Ctor: new (...args: never[]) => object, ...args: never[]) =>
        new Ctor(...args),
    ),

    addDrawingNode: vi.fn(),
    addOverlayNode: vi.fn(),
    removeNode: vi.fn(),
    removeNodeById: vi.fn(),
    getNodeById: vi.fn(() => null),
    redrawDrawingLayer: vi.fn(),
    redrawOverlayLayer: vi.fn(),
    toggleDrawing: vi.fn(),
    resetRoomScene: vi.fn(),
  };

  return fake as unknown as StageOperations;
}

function renderProvider(roomId: string, stageOperations: StageOperations) {
  return render(
    <BoardManagersProvider
      url={SOCKET_URL}
      roomId={roomId}
      stageOperations={stageOperations}
    >
      {null}
    </BoardManagersProvider>,
  );
}

function createdSockets(): MockSocket[] {
  return vi
    .mocked(io)
    .mock.results.map((result) => result.value as unknown as MockSocket);
}

/**
 * Drives the real coordinator through:
 *
 *   connect → join ack → sync
 *
 * and asserts the intermediate/final lifecycle state.
 */
async function driveSessionToReady() {
  serverEmit("connect");
  await flushAsync();

  expect(useSessionStore.getState().session.phase).toBe("joining");

  serverAck("room:join", undefined, {
    role: "editor",
    permissions: {
      read: true,
      draw: true,
    },
  });

  serverEmit("room:sync", []);

  await flushAsync();

  expect(useSessionStore.getState().session.phase).toBe("ready");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let harness: HttpAdapterHarness;

beforeEach(() => {
  resetAuthStore();

  useSessionStore.getState().reset();

  useToolStore.setState({
    activeToolId: null,
    allTools: [],
  });

  harness = installHttpAdapter(apiClient);
});

describe("socket auth lifecycle", () => {
  it("starts with the current token and rotates auth on a healthy connection without reconnecting", async () => {
    useAuthStore.setState({
      user: sessionWith("token-1").user,
      accessToken: "token-1",
      status: "authenticated",
    });

    renderProvider("room-a", createStageOperationsFake());

    await flushAsync();

    const sockets = createdSockets();

    expect(sockets).toHaveLength(1);

    const socket = sockets[0];

    expect(socket.connect).toHaveBeenCalledTimes(1);

    // The initial handshake uses the token current when the coordinator
    // started.
    expect(socket.auth).toMatchObject({
      userId: "user-1",
      token: "token-1",
    });

    act(() => {
      useAuthStore.setState({
        accessToken: "token-2",
      });
    });

    // Token rotation updates the auth used for a future reconnect without
    // disturbing the current healthy transport.
    expect(socket.auth).toMatchObject({
      userId: "user-1",
      token: "token-2",
    });

    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(createdSockets()).toHaveLength(1);
  });

  it("logout disposes the active generation, disconnects its transport, and fires exactly one revocation", async () => {
    useAuthStore.setState({
      user: sessionWith("token-1").user,
      accessToken: "token-1",
      status: "authenticated",
    });

    harness.stub((request) => {
      if (request.url === "/auth/logout") {
        expect(request.method).toBe("post");

        return {
          status: 204,
        };
      }

      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });

    renderProvider("room-a", createStageOperationsFake());

    await flushAsync();

    const socket = createdSockets()[0];

    await driveSessionToReady();

    expect(useSessionStore.getState().session.canDraw).toBe(true);

    await authApi.logout();

    // logout() clears the auth state locally before sending the revocation.
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      accessToken: null,
      status: "unauthenticated",
    });

    // The active board-session generation was disposed.
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socket.removeAllListeners).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);

    // A later transport-level connect event cannot revive the disposed
    // session.
    serverEmit("connect");
    await flushAsync();

    expect(socketEmissions(socket, "room:join")).toHaveLength(1);

    // revokeServerSession() uses the same shared apiClient.
    expect(harness.requests).toHaveLength(1);

    expect(harness.requests[0]).toMatchObject({
      url: "/auth/logout",
      method: "post",
    });

    // Auth endpoints are excluded from bearer authentication.
    expect(harness.requests[0].headers.Authorization).toBeUndefined();

    // Logout explicitly disables refresh/replay.
    expect(harness.requests[0].metadata).toEqual({
      allowAuthRefresh: false,
    });
  });

  it("a token change after unmount cannot touch the dead connection", async () => {
    useAuthStore.setState({
      accessToken: "token-1",
      status: "authenticated",
    });

    const { unmount } = renderProvider("room-a", createStageOperationsFake());

    await flushAsync();

    const socket = createdSockets()[0];

    expect(socket.auth).toMatchObject({
      token: "token-1",
    });

    expect(socket.disconnect).not.toHaveBeenCalled();

    unmount();

    expect(socket.disconnect).toHaveBeenCalledTimes(1);

    act(() => {
      useAuthStore.setState({
        accessToken: "token-after-unmount",
      });
    });

    // The auth subscription was removed with the effect, so the dead socket
    // remains unchanged and no replacement socket is created.
    expect(socket.auth.token).toBe("token-1");

    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(createdSockets()).toHaveLength(1);
  });
});
