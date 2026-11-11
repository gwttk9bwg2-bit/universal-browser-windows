import { describe, expect, it } from "vitest";
import { AgentManager } from "../src/agents.js";

describe("AgentManager", () => {
  it("enforces one writer and human takeover", () => {
    const agents = new AgentManager(); expect(agents.acquire("a")).toBe(true); expect(agents.acquire("b")).toBe(false); expect(agents.canWrite("a")).toBe(true);
    agents.takeHumanControl(); expect(agents.canWrite("a")).toBe(false); expect(agents.acquire("b")).toBe(false); agents.resumeAgents(); expect(agents.acquire("b")).toBe(true);
  });
});
