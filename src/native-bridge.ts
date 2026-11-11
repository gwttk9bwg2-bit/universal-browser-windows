import { EventEmitter } from "node:events";
import type { WebSocket } from "ws";
import { BaseBrowserAdapter } from "./browser.js";
import type { BrowserAction, BrowserKind, BrowserSessionInfo } from "./types.js";
import { errorMessage, id, now } from "./util.js";

type Pending = { connectionId: string; resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };

export class NativeBridge extends EventEmitter {
  #connections = new Map<string, WebSocket>();
  #pending = new Map<string, Pending>();

  attach(connectionId: string, socket: WebSocket): void {
    const previous = this.#connections.get(connectionId);
    if (previous && previous !== socket) previous.close();
    this.#connections.set(connectionId, socket);
    socket.on("message", (raw) => this.#onMessage(connectionId, String(raw)));
    socket.on("close", () => {
      if (this.#connections.get(connectionId) !== socket) return;
      this.#connections.delete(connectionId);
      for (const [requestId, pending] of this.#pending) {
        if (pending.connectionId !== connectionId) continue;
        clearTimeout(pending.timer);
        pending.reject(new Error("Browser extension disconnected during the command."));
        this.#pending.delete(requestId);
      }
      this.emit("disconnected", connectionId);
    });
    this.emit("connected", connectionId);
  }

  connected(): string[] { return [...this.#connections.keys()]; }

  send(connectionId: string, payload: Record<string, unknown>, timeoutMs = 20_000): Promise<unknown> {
    const socket = this.#connections.get(connectionId);
    if (!socket || socket.readyState !== socket.OPEN) return Promise.reject(new Error("Browser extension is not connected."));
    const requestId = id("native");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.#pending.delete(requestId); reject(new Error("Browser extension command timed out.")); }, timeoutMs);
      this.#pending.set(requestId, { connectionId, resolve, reject, timer });
      socket.send(JSON.stringify({ requestId, ...payload }));
    });
  }

  #onMessage(connectionId: string, raw: string): void {
    try {
      const message = JSON.parse(raw) as Record<string, unknown>;
      const requestId = String(message.requestId ?? "");
      const pending = this.#pending.get(requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.#pending.delete(requestId);
        if (message.error) pending.reject(new Error(String(message.error))); else pending.resolve(message.result);
        return;
      }
      this.emit("event", connectionId, message);
    } catch (error) {
      this.emit("error", new Error(`Invalid native bridge message: ${errorMessage(error)}`));
    }
  }
}

export class ExtensionAdapter extends BaseBrowserAdapter {
  readonly info: BrowserSessionInfo;
  #unsubscribe?: () => void;

  constructor(private readonly bridge: NativeBridge, private readonly connectionId: string, browser: BrowserKind) {
    super();
    this.info = {
      id: `extension:${connectionId}`,
      name: `${browser} extension`,
      browser,
      connection: "extension",
      state: "disconnected",
      humanControlled: false,
      connectedAt: now(),
      capabilities: ["tabs", "dom", "input", "screenshot", "console", "network", "existing-profile"]
    };
  }

  async connect(): Promise<void> {
    if (!this.bridge.connected().includes(this.connectionId)) throw new Error("Native host is not connected.");
    this.info.state = "ready";
    const listener = (id: string, message: Record<string, unknown>) => {
      if (id !== this.connectionId) return;
      const kind = String(message.kind ?? "page") as "page" | "console" | "network" | "websocket" | "security";
      this.emitBrowser(kind, message);
    };
    this.bridge.on("event", listener);
    this.#unsubscribe = () => this.bridge.off("event", listener);
  }

  async disconnect(): Promise<void> { this.#unsubscribe?.(); this.info.state = "disconnected"; }

  async execute(action: BrowserAction): Promise<unknown> {
    return this.bridge.send(this.connectionId, { type: "browser_action", action });
  }
}
