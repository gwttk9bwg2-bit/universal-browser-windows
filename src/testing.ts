import type { TestCase } from "./types.js";
import type { AutomationEngine } from "./automation.js";
import { id, now } from "./util.js";

export interface TestRun {
  id: string;
  name: string;
  passed: boolean;
  startedAt: string;
  finishedAt: string;
  assertions: Array<{ assertion: TestCase["assertions"][number]; passed: boolean; message?: string }>;
  taskId: string;
}

export class TestingEngine {
  #runs: TestRun[] = [];
  constructor(private readonly automation: AutomationEngine) {}
  list(): TestRun[] { return [...this.#runs].reverse(); }

  async run(test: TestCase, agentId: string, sessionId: string): Promise<TestRun> {
    const startedAt = now();
    const task = this.automation.create({ name: `Test: ${test.name}`, agentId, sessionId, steps: test.steps });
    const completed = await this.automation.run(task.id);
    const snapshotTask = this.automation.create({ name: `Assertions: ${test.name}`, agentId, sessionId, steps: [{ id: "snapshot", action: { type: "snapshot" } }] });
    const snapshotResult = await this.automation.run(snapshotTask.id);
    const snapshot = (snapshotResult.results[0] ?? {}) as Record<string, unknown>;
    const assertions = test.assertions.map((assertion) => {
      let passed = false;
      if (assertion.type === "url_contains") passed = String(snapshot.url ?? "").includes(assertion.value);
      if (assertion.type === "title_contains") passed = String(snapshot.title ?? "").includes(assertion.value);
      if (assertion.type === "text_visible" || assertion.type === "selector_visible") passed = String(snapshot.text ?? "").includes(assertion.value);
      return { assertion, passed, message: passed ? undefined : `Expected ${assertion.type}: ${assertion.value}` };
    });
    const run: TestRun = { id: id("test"), name: test.name, passed: completed.state === "completed" && assertions.every((a) => a.passed), startedAt, finishedAt: now(), assertions, taskId: task.id };
    this.#runs.push(run);
    return run;
  }
}
