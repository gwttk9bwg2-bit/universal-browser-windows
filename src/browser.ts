import { EventEmitter } from "node:events";
import type { BrowserAction, BrowserEvent, BrowserSessionInfo } from "./types.js";

export interface BrowserAdapter {
  readonly info: BrowserSessionInfo;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  execute(action: BrowserAction): Promise<unknown>;
  onEvent(listener: (event: Omit<BrowserEvent, "id" | "at">) => void): () => void;
}

export abstract class BaseBrowserAdapter extends EventEmitter implements BrowserAdapter {
  abstract readonly info: BrowserSessionInfo;
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract execute(action: BrowserAction): Promise<unknown>;

  onEvent(listener: (event: Omit<BrowserEvent, "id" | "at">) => void): () => void {
    this.on("browser-event", listener);
    return () => this.off("browser-event", listener);
  }

  protected emitBrowser(kind: BrowserEvent["kind"], data: Record<string, unknown>): void {
    this.emit("browser-event", { sessionId: this.info.id, kind, data });
  }
}
