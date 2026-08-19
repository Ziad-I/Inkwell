/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  io,
  Socket,
  type ManagerOptions,
  type SocketOptions,
} from "socket.io-client";
import type { ClientEmitEvents, ClientListenEvents } from "@/types/events";

type EventMap = Record<string, (...args: any[]) => void>;

export class ConnectionManager<
  TEmit extends EventMap = ClientEmitEvents,
  TListen extends EventMap = ClientListenEvents,
> {
  private socket: Socket;

  constructor(url: string, options?: Partial<ManagerOptions & SocketOptions>) {
    this.socket = io(url, {
      autoConnect: false,
      withCredentials: true,
      ...options,
    });
  }

  connect() {
    this.socket.connect();
  }

  onConnect(handler: () => void): void {
    this.socket.on("connect", handler);
  }

  disconnect() {
    this.cleanup();
    this.socket.disconnect();
  }

  cleanup() {
    this.socket.removeAllListeners();
  }

  emit<TEvent extends keyof TEmit & string>(
    event: TEvent,
    ...args: Parameters<TEmit[TEvent]>
  ) {
    this.socket.emit(event, ...args);
  }

  on<TEvent extends keyof TListen & string>(
    event: TEvent,
    handler: TListen[TEvent],
  ) {
    this.socket.on(event, handler as any);
  }

  off<TEvent extends keyof TListen & string>(
    event: TEvent,
    handler: TListen[TEvent],
  ) {
    this.socket.off(event, handler as any);
  }

  once<TEvent extends keyof TListen & string>(
    event: TEvent,
    handler: TListen[TEvent],
  ) {
    this.socket.once(event, handler as any);
  }
}
