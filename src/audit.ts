import type { AuditEntry, BrowserEvent } from "./types.js";
import { id, now } from "./util.js";
import { redact } from "./security.js";

export class EventStore {
  #audit: AuditEntry[] = [];
  #events: BrowserEvent[] = [];
  constructor(private readonly maxItems = 2_000) {}

  addAudit(entry: Omit<AuditEntry, "id" | "at">): AuditEntry {
    const full = redact({ id: id("audit"), at: now(), ...entry });
    this.#audit.push(full);
    if (this.#audit.length > this.maxItems) this.#audit.shift();
    return full;
  }

  addEvent(event: Omit<BrowserEvent, "id" | "at">): BrowserEvent {
    const full = redact({ id: id("evt"), at: now(), ...event });
    this.#events.push(full);
    if (this.#events.length > this.maxItems) this.#events.shift();
    return full;
  }

  audit(limit = 100): AuditEntry[] { return this.#audit.slice(-limit).reverse(); }
  events(limit = 200, kind?: BrowserEvent["kind"]): BrowserEvent[] {
    const source = kind ? this.#events.filter((e) => e.kind === kind) : this.#events;
    return source.slice(-limit).reverse();
  }
}
