import type { BrowserAdapter } from "./browser.js";
import { AgentManager } from "./agents.js";
import { EventStore } from "./audit.js";
import { AutomationEngine } from "./automation.js";
import { PermissionManager, actionRisk, isCaptcha, redact } from "./security.js";
import { TestingEngine } from "./testing.js";
import type { BrowserActionRequest, BrowserSessionInfo } from "./types.js";
import { errorMessage } from "./util.js";

export class UniversalBrowserRuntime {
  readonly agents = new AgentManager();
  readonly events = new EventStore();
  readonly permissions = new PermissionManager();
  readonly automation = new AutomationEngine((request) => this.execute(request));
  readonly testing = new TestingEngine(this.automation);
  #adapters = new Map<string, BrowserAdapter>();

  async addAdapter(adapter: BrowserAdapter): Promise<BrowserSessionInfo> {
    if (this.#adapters.has(adapter.info.id)) throw new Error(`Session ${adapter.info.id} already exists.`);
    adapter.onEvent((event) => {
      const stored = this.events.addEvent(event);
      const text = JSON.stringify(stored.data);
      if (isCaptcha(text)) {
        adapter.info.state = "paused";
        this.events.addEvent({ sessionId: adapter.info.id, kind: "security", data: { reason: "captcha", instruction: "Human verification required before resume." } });
      }
    });
    this.#adapters.set(adapter.info.id, adapter);
    try { await adapter.connect(); return adapter.info; }
    catch (error) { this.#adapters.delete(adapter.info.id); throw error; }
  }

  async removeAdapter(sessionId: string): Promise<void> {
    const adapter = this.#require(sessionId);
    await adapter.disconnect();
    this.#adapters.delete(sessionId);
  }

  sessions(): BrowserSessionInfo[] { return [...this.#adapters.values()].map((a) => a.info); }
  session(sessionId: string): BrowserSessionInfo { return this.#require(sessionId).info; }

  async execute(request: BrowserActionRequest): Promise<unknown> {
    const adapter = this.#require(request.sessionId);
    const risk = actionRisk(request.action);
    this.agents.register(request.agentId);
    if (adapter.info.state === "paused") throw new Error("Session is paused for human intervention.");
    if (adapter.info.humanControlled || (risk !== "read" && !this.agents.canWrite(request.agentId))) {
      this.events.addAudit({ agentId: request.agentId, sessionId: request.sessionId, action: request.action.type, risk, outcome: "blocked", details: { reason: "Agent does not hold the global control lock." } });
      throw new Error("Agent does not hold the global control lock.");
    }
    const auth = this.permissions.authorize(request.agentId, request.sessionId, request.action, request.approvalToken);
    if (!auth.allowed) {
      this.events.addAudit({ agentId: request.agentId, sessionId: request.sessionId, action: request.action.type, risk, outcome: "blocked", details: { reason: auth.reason } });
      throw new Error(auth.reason);
    }
    this.events.addAudit({ agentId: request.agentId, sessionId: request.sessionId, action: request.action.type, risk, outcome: "allowed", details: redact(request.action) });
    try {
      const result = await adapter.execute(request.action);
      this.events.addAudit({ agentId: request.agentId, sessionId: request.sessionId, action: request.action.type, risk, outcome: "completed", details: { result: redact(result) } });
      return redact(result);
    } catch (error) {
      this.events.addAudit({ agentId: request.agentId, sessionId: request.sessionId, action: request.action.type, risk, outcome: "failed", details: { error: errorMessage(error) } });
      throw error;
    }
  }

  takeHumanControl(sessionId: string): void { const session = this.#require(sessionId).info; session.humanControlled = true; session.state = "paused"; this.agents.takeHumanControl(); }
  resume(sessionId: string): void { const session = this.#require(sessionId).info; session.humanControlled = false; session.state = "ready"; this.agents.resumeAgents(); }
  #require(sessionId: string): BrowserAdapter { const adapter = this.#adapters.get(sessionId); if (!adapter) throw new Error(`Browser session ${sessionId} was not found.`); return adapter; }
}
