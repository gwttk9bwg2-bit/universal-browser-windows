import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { errorMessage } from "./util.js";
import { dataDirectory } from "./paths.js";

export type WindowsAction =
  | { type: "cursor" }
  | { type: "list_windows" }
  | { type: "focus_window"; title?: string; handle?: number }
  | { type: "move"; x: number; y: number }
  | { type: "click"; x?: number; y?: number; button?: "left" | "right" | "middle"; clicks?: number }
  | { type: "scroll"; delta: number; x?: number; y?: number }
  | { type: "drag"; fromX: number; fromY: number; toX: number; toY: number; durationMs?: number }
  | { type: "hotkey"; keys: string }
  | { type: "type_text"; text: string }
  | { type: "screenshot"; path?: string }
  | { type: "uia_snapshot"; title?: string; handle?: number; maxDepth?: number; maxNodes?: number }
  | { type: "uia_invoke"; title?: string; handle?: number; name?: string; nameContains?: string; automationId?: string; controlType?: string }
  | { type: "uia_set_value"; title?: string; handle?: number; name?: string; nameContains?: string; automationId?: string; controlType?: string; value: string };

export function isWindowsReadAction(action: WindowsAction): boolean {
  return action.type === "cursor" || action.type === "list_windows" || action.type === "screenshot" || action.type === "uia_snapshot";
}

export class WindowsController {
  readonly scriptPath: string;

  constructor(scriptPath?: string) {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    this.scriptPath = scriptPath ?? resolve(moduleDir, "..", "scripts", "windows-input.ps1");
  }

  execute(action: WindowsAction, timeoutMs = 20_000): Promise<unknown> {
    if (process.platform !== "win32") return Promise.reject(new Error("Windows native control is only available on Windows."));
    const normalized = action.type === "screenshot" && !action.path
      ? { ...action, path: resolve(dataDirectory(), "screenshots", `windows-${Date.now()}.png`) }
      : action;
    const payload = Buffer.from(JSON.stringify(normalized), "utf8").toString("base64");
    return new Promise((resolveResult, reject) => {
      const child = spawn("powershell.exe", ["-STA", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", this.scriptPath, "-Payload", payload], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => { child.kill(); reject(new Error("Windows control action timed out.")); }, timeoutMs);
      child.stdout.setEncoding("utf8"); child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.setEncoding("utf8"); child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) { reject(new Error(stderr.trim() || `Windows controller exited with code ${code}.`)); return; }
        try {
          const response = JSON.parse(stdout.trim()) as { ok: boolean; result?: unknown; error?: string };
          if (!response.ok) reject(new Error(response.error ?? "Windows control action failed.")); else resolveResult(response.result);
        } catch (error) { reject(new Error(`Invalid Windows controller response: ${errorMessage(error)}`)); }
      });
    });
  }
}
