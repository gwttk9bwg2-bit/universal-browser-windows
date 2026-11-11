import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { browserActionSchema, browserSchema } from "./schemas.js";

export interface McpOptions { baseUrl?: string; agentId?: string }

export function createMcpServer(options: McpOptions = {}): McpServer {
  const baseUrl = options.baseUrl ?? process.env.UB_BASE_URL ?? "http://127.0.0.1:3210";
  const agentId = options.agentId ?? process.env.UB_AGENT_ID ?? `mcp-${process.pid}`;
  const server = new McpServer({ name: "universal-browser", version: "1.0.0" });
  const windowsActionSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("cursor") }),
    z.object({ type: z.literal("list_windows") }),
    z.object({ type: z.literal("focus_window"), title: z.string().optional(), handle: z.number().optional() }),
    z.object({ type: z.literal("move"), x: z.number(), y: z.number() }),
    z.object({ type: z.literal("click"), x: z.number().optional(), y: z.number().optional(), button: z.enum(["left", "right", "middle"]).optional(), clicks: z.number().int().min(1).max(3).optional() }),
    z.object({ type: z.literal("scroll"), delta: z.number(), x: z.number().optional(), y: z.number().optional() }),
    z.object({ type: z.literal("drag"), fromX: z.number(), fromY: z.number(), toX: z.number(), toY: z.number(), durationMs: z.number().int().positive().optional() }),
    z.object({ type: z.literal("hotkey"), keys: z.string().describe("Windows Forms SendKeys syntax, for example ^l for Ctrl+L or {ENTER}.") }),
    z.object({ type: z.literal("type_text"), text: z.string() }),
    z.object({ type: z.literal("screenshot"), path: z.string().optional() }),
    z.object({ type: z.literal("uia_snapshot"), title: z.string().optional(), handle: z.number().optional(), maxDepth: z.number().int().min(1).max(8).optional(), maxNodes: z.number().int().min(10).max(1000).optional() }),
    z.object({ type: z.literal("uia_invoke"), title: z.string().optional(), handle: z.number().optional(), name: z.string().optional(), nameContains: z.string().optional(), automationId: z.string().optional(), controlType: z.string().optional() }),
    z.object({ type: z.literal("uia_set_value"), title: z.string().optional(), handle: z.number().optional(), name: z.string().optional(), nameContains: z.string().optional(), automationId: z.string().optional(), controlType: z.string().optional(), value: z.string() })
  ]);

  const api = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    const body = await response.json() as Record<string, unknown>;
    if (!response.ok || body.ok === false) throw new Error(String(body.error ?? `HTTP ${response.status}`));
    return body;
  };
  const findPngPath = (value: unknown, depth = 0): string | undefined => {
    if (depth > 5 || !value || typeof value !== "object") return undefined;
    if ("path" in value && typeof (value as { path?: unknown }).path === "string" && /\.png$/i.test((value as { path: string }).path)) return (value as { path: string }).path;
    for (const nested of Object.values(value as Record<string, unknown>)) {
      const found = findPngPath(nested, depth + 1);
      if (found) return found;
    }
    return undefined;
  };
  const findImageData = (value: unknown, depth = 0): { data: string; mimeType: string } | undefined => {
    if (depth > 5 || !value || typeof value !== "object") return undefined;
    if ("dataUrl" in value && typeof (value as { dataUrl?: unknown }).dataUrl === "string") {
      const match = (value as { dataUrl: string }).dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
      if (match) return { mimeType: match[1], data: match[2] };
    }
    for (const nested of Object.values(value as Record<string, unknown>)) {
      const found = findImageData(nested, depth + 1);
      if (found) return found;
    }
    return undefined;
  };
  const withoutInlineImage = (value: unknown, depth = 0): unknown => {
    if (depth > 8 || !value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map((item) => withoutInlineImage(item, depth + 1));
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      key === "dataUrl" && typeof item === "string" && item.startsWith("data:image/") ? "[inline image attached]" : withoutInlineImage(item, depth + 1)
    ]));
  };
  const result = async (value: unknown) => {
    const structured = withoutInlineImage(value) as Record<string, unknown>;
    const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
      { type: "text", text: JSON.stringify(structured, null, 2) }
    ];
    const inlineImage = findImageData(value);
    const path = findPngPath(value);
    if (inlineImage) content.push({ type: "image", ...inlineImage });
    else if (path) {
      try { content.push({ type: "image", data: (await readFile(path)).toString("base64"), mimeType: "image/png" }); } catch { /* Path remains in text output. */ }
    }
    return { content, structuredContent: structured };
  };

  server.registerTool("browser_status", { description: "List browser sessions, agents, tasks and control state.", inputSchema: {} }, async () => result(await api("/api/status")));
  server.registerTool("browser_connect", {
    description: "Connect an installed browser automatically. Reuses an existing ready session of the requested browser when possible.",
    inputSchema: { browser: browserSchema.optional(), headless: z.boolean().optional(), name: z.string().optional() }
  }, async ({ browser = "edge", headless = false, name }) => {
    const status = await api("/api/status") as { sessions?: Array<Record<string, unknown>> };
    const existing = status.sessions?.find((session) => session.browser === browser && session.state === "ready");
    if (existing) return result({ ok: true, reused: true, session: existing });
    const id = `managed-${browser}-${Date.now()}`;
    return result(await api("/api/sessions/playwright", { method: "POST", body: JSON.stringify({ id, name: name ?? `${browser} managed`, browser, headless }) }));
  });
  server.registerTool("browser_disconnect", {
    description: "Close and remove a managed browser session when the task is finished.",
    inputSchema: { sessionId: z.string() }
  }, async ({ sessionId }) => result(await api(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" })));
  server.registerTool("browser_observe", {
    description: "Observe a browser session through DOM text, browser accessibility, an optional screenshot, and an optional Windows UI Automation tree. Use this before acting and after any state-changing action.",
    inputSchema: { sessionId: z.string(), screenshot: z.boolean().optional(), windows: z.boolean().optional() }
  }, async ({ sessionId, screenshot = true, windows = false }) => {
    const status = await api("/api/status") as { sessions?: Array<Record<string, unknown>> };
    const session = status.sessions?.find((item) => item.id === sessionId);
    if (!session) throw new Error(`Browser session ${sessionId} was not found.`);
    const observed: Record<string, unknown> = { ok: true, session };
    const observeAction = async (action: Record<string, unknown>) => {
      try { return await api("/api/actions", { method: "POST", body: JSON.stringify({ agentId, sessionId, action }) }); }
      catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
    };
    observed.dom = await observeAction({ type: "snapshot" });
    observed.accessibility = await observeAction({ type: "accessibility_snapshot" });
    if (screenshot) observed.screenshot = await observeAction({ type: "screenshot" });
    if (windows) {
      try {
        observed.windows = await api("/api/windows/actions", { method: "POST", body: JSON.stringify({ agentId, sessionId, action: { type: "uia_snapshot", title: session.activeTitle, maxDepth: 5, maxNodes: 500 } }) });
      } catch (error) { observed.windows = { ok: false, error: error instanceof Error ? error.message : String(error) }; }
    }
    return result(observed);
  });
  server.registerTool("control_acquire", { description: "Acquire the global browser write lock before navigation or input.", inputSchema: { ttlMs: z.number().int().min(1000).max(300000).optional() } }, async ({ ttlMs }) => result(await api("/api/control/acquire", { method: "POST", body: JSON.stringify({ agentId, ttlMs }) })));
  server.registerTool("control_release", { description: "Release the global browser write lock.", inputSchema: {} }, async () => result(await api("/api/control/release", { method: "POST", body: JSON.stringify({ agentId }) })));
  server.registerTool("approval_create", {
    description: "Create a short-lived one-time approval token only after the user explicitly confirms the specific sensitive or destructive action.",
    inputSchema: { sessionId: z.string(), actionType: z.string().min(1) }
  }, async ({ sessionId, actionType }) => result(await api("/api/approvals", { method: "POST", body: JSON.stringify({ agentId, sessionId, actionType }) })));
  server.registerTool("browser_action", {
    description: "Control or inspect a connected browser. Sensitive/destructive actions require a one-time approval token.",
    inputSchema: { sessionId: z.string(), action: browserActionSchema, approvalToken: z.string().optional() }
  }, async ({ sessionId, action, approvalToken }) => result(await api("/api/actions", { method: "POST", body: JSON.stringify({ agentId, sessionId, action, approvalToken }) })));
  server.registerTool("windows_action", {
    description: "Fallback to real Windows mouse, keyboard, window, clipboard-style text input, scrolling, dragging, or full-screen capture when DOM/browser APIs cannot complete a browser task. A browser session and its write lock are still required.",
    inputSchema: { sessionId: z.string(), action: windowsActionSchema }
  }, async ({ sessionId, action }) => result(await api("/api/windows/actions", { method: "POST", body: JSON.stringify({ agentId, sessionId, action }) })));
  server.registerTool("browser_events", { description: "Read recent page, console, network and WebSocket events.", inputSchema: { kind: z.enum(["page", "console", "network", "websocket", "download", "security", "control"]).optional(), limit: z.number().int().min(1).max(500).optional() } }, async ({ kind, limit }) => result(await api(`/api/events?${new URLSearchParams({ ...(kind ? { kind } : {}), ...(limit ? { limit: String(limit) } : {}) })}`)));
  server.registerTool("network_har", { description: "Export observed HTTP requests and responses as a redacted HAR 1.2 document.", inputSchema: {} }, async () => result(await api("/api/network/har")));
  server.registerTool("audit_log", { description: "Read the redacted operation audit trail.", inputSchema: { limit: z.number().int().min(1).max(500).optional() } }, async ({ limit }) => result(await api(`/api/audit?limit=${limit ?? 100}`)));
  server.registerTool("automation_create", {
    description: "Create and asynchronously run a browser automation task.",
    inputSchema: { name: z.string(), sessionId: z.string(), steps: z.array(z.object({ id: z.string(), action: browserActionSchema, retry: z.number().int().min(0).max(5).optional(), timeoutMs: z.number().positive().optional() })) }
  }, async ({ name, sessionId, steps }) => result(await api("/api/tasks", { method: "POST", body: JSON.stringify({ name, agentId, sessionId, steps }) })));
  server.registerTool("human_resume", { description: "Resume an AI session after the human has completed CAPTCHA or manual intervention.", inputSchema: { sessionId: z.string() } }, async ({ sessionId }) => result(await api("/api/control/resume", { method: "POST", body: JSON.stringify({ sessionId }) })));
  return server;
}
