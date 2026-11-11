import type { AutomationTask, BrowserActionRequest, AutomationStep } from "./types.js";
import { delay, errorMessage, id, now } from "./util.js";

export type ActionExecutor = (request: BrowserActionRequest) => Promise<unknown>;

export class AutomationEngine {
  #tasks = new Map<string, AutomationTask>();
  constructor(private readonly executeAction: ActionExecutor) {}

  create(input: { name: string; agentId: string; sessionId: string; steps: AutomationStep[] }): AutomationTask {
    const task: AutomationTask = { id: id("task"), ...input, state: "queued", currentStep: 0, createdAt: now(), updatedAt: now(), results: [] };
    this.#tasks.set(task.id, task);
    return task;
  }

  list(): AutomationTask[] { return [...this.#tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  get(taskId: string): AutomationTask | undefined { return this.#tasks.get(taskId); }
  pause(taskId: string): void { const task = this.#require(taskId); if (task.state === "running" || task.state === "queued") task.state = "paused"; task.updatedAt = now(); }
  resume(taskId: string): Promise<AutomationTask> { const task = this.#require(taskId); if (task.state !== "paused" && task.state !== "failed") throw new Error("Only paused or failed tasks can resume."); return this.run(taskId); }
  cancel(taskId: string): void { const task = this.#require(taskId); task.state = "cancelled"; task.updatedAt = now(); }

  async run(taskId: string): Promise<AutomationTask> {
    const task = this.#require(taskId);
    task.state = "running";
    task.error = undefined;
    task.updatedAt = now();
    while (task.currentStep < task.steps.length) {
      if (task.state !== "running") return task;
      const step = task.steps[task.currentStep];
      let lastError: unknown;
      for (let attempt = 0; attempt <= (step.retry ?? 0); attempt++) {
        try {
          const result = await Promise.race([
            this.executeAction({ agentId: task.agentId, sessionId: task.sessionId, action: step.action }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Step timed out.")), step.timeoutMs ?? 30_000))
          ]);
          task.results.push(result);
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < (step.retry ?? 0)) await delay(Math.min(1_000 * 2 ** attempt, 5_000));
        }
      }
      if (lastError) { task.state = "failed"; task.error = errorMessage(lastError); task.updatedAt = now(); return task; }
      task.currentStep++;
      task.updatedAt = now();
    }
    task.state = "completed";
    task.updatedAt = now();
    return task;
  }

  #require(taskId: string): AutomationTask { const task = this.#tasks.get(taskId); if (!task) throw new Error("Task not found."); return task; }
}
