import type { AgentIdentity } from "./types.js";
import { now } from "./util.js";

export class AgentManager {
  #agents = new Map<string, AgentIdentity>();
  #lock: { agentId: string; acquiredAt: string; expiresAt: number } | null = null;
  #humanControlled = false;

  register(id: string, name = id): AgentIdentity {
    const existing = this.#agents.get(id);
    const agent = existing ?? { id, name, connectedAt: now(), lastSeenAt: now() };
    agent.name = name;
    agent.lastSeenAt = now();
    this.#agents.set(id, agent);
    return agent;
  }

  list(): AgentIdentity[] {
    return [...this.#agents.values()];
  }

  acquire(agentId: string, ttlMs = 30_000): boolean {
    this.register(agentId);
    this.#expire();
    if (this.#humanControlled) return false;
    if (this.#lock && this.#lock.agentId !== agentId) return false;
    this.#lock = { agentId, acquiredAt: now(), expiresAt: Date.now() + ttlMs };
    return true;
  }

  heartbeat(agentId: string, ttlMs = 30_000): boolean {
    if (this.#lock?.agentId !== agentId) return false;
    this.#lock.expiresAt = Date.now() + ttlMs;
    this.register(agentId);
    return true;
  }

  release(agentId: string): boolean {
    if (this.#lock?.agentId !== agentId) return false;
    this.#lock = null;
    return true;
  }

  takeHumanControl(): void {
    this.#humanControlled = true;
    this.#lock = null;
  }

  resumeAgents(): void {
    this.#humanControlled = false;
  }

  canWrite(agentId: string): boolean {
    this.#expire();
    return !this.#humanControlled && this.#lock?.agentId === agentId;
  }

  status(): Record<string, unknown> {
    this.#expire();
    return { humanControlled: this.#humanControlled, lock: this.#lock, agents: this.list() };
  }

  #expire(): void {
    if (this.#lock && this.#lock.expiresAt < Date.now()) this.#lock = null;
  }
}
