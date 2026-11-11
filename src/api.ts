import { createServer, type Server as HttpServer } from "node:http";
import { resolve } from "node:path";
import express, { type Request, type Response, type NextFunction } from "express";
import { WebSocketServer } from "ws";
import { z } from "zod";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { UniversalBrowserRuntime } from "./runtime.js";
import { NativeBridge, ExtensionAdapter } from "./native-bridge.js";
import { PlaywrightAdapter } from "./playwright-adapter.js";
import { errorMessage } from "./util.js";
import type { BrowserAction, BrowserKind } from "./types.js";
import { createMcpServer } from "./mcp.js";
import { WindowsController, isWindowsReadAction, type WindowsAction } from "./windows-controller.js";
import { browserActionSchema as actionSchema, browserSchema } from "./schemas.js";
import { detectedBrowsers } from "./browsers.js";

export interface ApiServerOptions { port?: number; host?: string; publicDir?: string }

export class ApiServer {
  readonly runtime = new UniversalBrowserRuntime();
  readonly bridge = new NativeBridge();
  readonly windows = new WindowsController();
  readonly app = express();
  #server?: HttpServer;
  #wss?: WebSocketServer;
  #token = process.env.UB_TOKEN;

  constructor(private readonly options: ApiServerOptions = {}) {
    this.bridge.on("event", (connectionId: string, message: Record<string, unknown>) => {
      if (message.kind !== "hello") return;
      const sessionId = `extension:${connectionId}`;
      if (this.runtime.sessions().some((session) => session.id === sessionId)) return;
      const reported = String(message.browser ?? "chromium");
      const browser = (["chrome", "edge", "firefox", "chromium"].includes(reported) ? reported : "chromium") as BrowserKind;
      void this.runtime.addAdapter(new ExtensionAdapter(this.bridge, connectionId, browser)).catch((error) => {
        this.runtime.events.addEvent({ sessionId, kind: "security", data: { reason: "extension-connect-failed", error: errorMessage(error) } });
      });
    });
    this.bridge.on("disconnected", (connectionId: string) => {
      const sessionId = `extension:${connectionId}`;
      if (!this.runtime.sessions().some((session) => session.id === sessionId)) return;
      void this.runtime.removeAdapter(sessionId).catch(() => undefined);
    });
    this.app.disable("x-powered-by");
    this.app.use(express.json({ limit: "2mb" }));
    this.#routes();
    this.app.use(express.static(options.publicDir ?? resolve("public")));
    this.app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      res.status(error instanceof z.ZodError ? 400 : 500).json({ ok: false, error: errorMessage(error) });
    });
  }

  async start(): Promise<{ host: string; port: number }> {
    if (this.#server) throw new Error("Server is already running.");
    this.#server = createServer(this.app);
    this.#wss = new WebSocketServer({ noServer: true });
    this.#server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
      if (url.pathname !== "/native") { socket.destroy(); return; }
      if (this.#token && url.searchParams.get("token") !== this.#token) {
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      const connectionId = url.searchParams.get("id") ?? "default";
      this.#wss!.handleUpgrade(request, socket, head, (ws) => this.bridge.attach(connectionId, ws));
    });
    const host = this.options.host ?? "127.0.0.1";
    const port = this.options.port ?? 3210;
    await new Promise<void>((resolveStart, reject) => {
      this.#server!.once("error", reject);
      this.#server!.listen(port, host, () => resolveStart());
    });
    return { host, port: (this.#server.address() as { port: number }).port };
  }

  async stop(): Promise<void> {
    for (const session of this.runtime.sessions()) await this.runtime.removeAdapter(session.id).catch(() => undefined);
    await new Promise<void>((resolveStop) => this.#server?.close(() => resolveStop()) ?? resolveStop());
    this.#wss?.close(); this.#server = undefined;
  }

  #routes(): void {
    const route = (handler: (req: Request, res: Response) => unknown | Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
      try { await handler(req, res); } catch (error) { next(error); }
    };
    this.app.get("/api/health", (_req, res) => res.json({ ok: true, version: "1.0.0", time: new Date().toISOString() }));
    this.app.post("/mcp", route(async (req, res) => {
      if (this.#token && req.header("authorization") !== `Bearer ${this.#token}` && req.header("x-ub-token") !== this.#token) {
        res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized." }, id: null });
        return;
      }
      const port = (this.#server?.address() as { port?: number } | null)?.port ?? this.options.port ?? 3210;
      const agentId = String(req.header("x-agent-id") ?? `http-${req.ip ?? "local"}`);
      const mcp = createMcpServer({ baseUrl: `http://127.0.0.1:${port}`, agentId });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => { void transport.close(); void mcp.close(); });
      await mcp.connect(transport);
      await transport.handleRequest(req, res, req.body);
    }));
    this.app.get("/mcp", (_req, res) => res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed in stateless mode." }, id: null }));
    this.app.delete("/mcp", (_req, res) => res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed in stateless mode." }, id: null }));
    this.app.get("/api/status", (_req, res) => res.json({ ok: true, sessions: this.runtime.sessions(), control: this.runtime.agents.status(), nativeConnections: this.bridge.connected(), tasks: this.runtime.automation.list(), tests: this.runtime.testing.list() }));
    this.app.get("/api/browsers", (_req, res) => res.json({ ok: true, browsers: detectedBrowsers() }));
    this.app.get("/api/events", (req, res) => res.json({ ok: true, events: this.runtime.events.events(Number(req.query.limit ?? 200), req.query.kind as never) }));
    this.app.get("/api/network/har", (_req, res) => {
      const network = this.runtime.events.events(2_000, "network").reverse();
      const requests = network.filter((event) => event.data.phase === "request");
      const entries = requests.map((request) => {
        const response = network.find((event) => event.data.phase === "response" && event.data.url === request.data.url && event.at >= request.at);
        return {
          startedDateTime: request.at,
          time: response ? Math.max(0, Date.parse(response.at) - Date.parse(request.at)) : 0,
          request: { method: request.data.method ?? "GET", url: request.data.url ?? "", httpVersion: "", headers: [], queryString: [], cookies: [], headersSize: -1, bodySize: -1 },
          response: { status: response?.data.status ?? 0, statusText: "", httpVersion: "", headers: [], cookies: [], content: { size: 0, mimeType: "" }, redirectURL: "", headersSize: -1, bodySize: -1 },
          cache: {}, timings: { send: 0, wait: 0, receive: 0 }
        };
      });
      res.json({ log: { version: "1.2", creator: { name: "Universal Browser", version: "1.0.0" }, entries } });
    });
    this.app.get("/api/audit", (req, res) => res.json({ ok: true, audit: this.runtime.events.audit(Number(req.query.limit ?? 100)) }));

    this.app.post("/api/agents/register", route((req, res) => { const input = z.object({ id: z.string().min(1), name: z.string().optional() }).parse(req.body); res.json({ ok: true, agent: this.runtime.agents.register(input.id, input.name) }); }));
    this.app.post("/api/control/acquire", route((req, res) => { const input = z.object({ agentId: z.string(), ttlMs: z.number().positive().max(300_000).optional() }).parse(req.body); res.json({ ok: true, acquired: this.runtime.agents.acquire(input.agentId, input.ttlMs) }); }));
    this.app.post("/api/control/release", route((req, res) => { const input = z.object({ agentId: z.string() }).parse(req.body); res.json({ ok: true, released: this.runtime.agents.release(input.agentId) }); }));
    this.app.post("/api/control/human", route((req, res) => { const input = z.object({ sessionId: z.string() }).parse(req.body); this.runtime.takeHumanControl(input.sessionId); res.json({ ok: true }); }));
    this.app.post("/api/control/resume", route((req, res) => { const input = z.object({ sessionId: z.string() }).parse(req.body); this.runtime.resume(input.sessionId); res.json({ ok: true }); }));
    this.app.post("/api/approvals", route((req, res) => { const input = z.object({ agentId: z.string(), sessionId: z.string(), actionType: z.string() }).parse(req.body); res.json({ ok: true, token: this.runtime.permissions.createApproval(input.agentId, input.sessionId, input.actionType) }); }));

    this.app.post("/api/sessions/playwright", route(async (req, res) => {
      const input = z.object({ id: z.string().min(1), name: z.string().optional(), browser: browserSchema, endpoint: z.string().optional(), executablePath: z.string().optional(), userDataDir: z.string().optional(), headless: z.boolean().optional() }).parse(req.body);
      const info = await this.runtime.addAdapter(new PlaywrightAdapter(input)); res.status(201).json({ ok: true, session: info });
    }));
    this.app.post("/api/sessions/extension", route(async (req, res) => {
      const input = z.object({ connectionId: z.string().min(1), browser: browserSchema }).parse(req.body);
      const info = await this.runtime.addAdapter(new ExtensionAdapter(this.bridge, input.connectionId, input.browser)); res.status(201).json({ ok: true, session: info });
    }));
    this.app.delete("/api/sessions/:id", route(async (req, res) => { await this.runtime.removeAdapter(String(req.params.id)); res.json({ ok: true }); }));
    this.app.post("/api/actions", route(async (req, res) => {
      const input = z.object({ agentId: z.string().min(1), sessionId: z.string().min(1), action: actionSchema, approvalToken: z.string().optional() }).parse(req.body);
      res.json({ ok: true, result: await this.runtime.execute({ ...input, action: input.action as BrowserAction }) });
    }));
    this.app.post("/api/windows/actions", route(async (req, res) => {
      const input = z.object({ agentId: z.string().min(1), sessionId: z.string().min(1), action: z.record(z.string(), z.unknown()) }).parse(req.body);
      const action = input.action as WindowsAction;
      this.runtime.session(input.sessionId);
      const risk = isWindowsReadAction(action) ? "read" : "write";
      if (risk === "write" && !this.runtime.agents.canWrite(input.agentId)) throw new Error("Agent does not hold the global control lock.");
      this.runtime.events.addAudit({ agentId: input.agentId, sessionId: input.sessionId, action: `windows:${String(action.type)}`, risk, outcome: "allowed", details: action as unknown as Record<string, unknown> });
      try {
        const result = await this.windows.execute(action);
        this.runtime.events.addAudit({ agentId: input.agentId, sessionId: input.sessionId, action: `windows:${String(action.type)}`, risk, outcome: "completed", details: { result } });
        res.json({ ok: true, result });
      } catch (error) {
        this.runtime.events.addAudit({ agentId: input.agentId, sessionId: input.sessionId, action: `windows:${String(action.type)}`, risk, outcome: "failed", details: { error: errorMessage(error) } });
        throw error;
      }
    }));
    this.app.post("/api/tasks", route(async (req, res) => {
      const input = z.object({ name: z.string(), agentId: z.string(), sessionId: z.string(), steps: z.array(z.object({ id: z.string(), action: actionSchema, retry: z.number().int().min(0).max(5).optional(), timeoutMs: z.number().positive().optional() })) }).parse(req.body);
      const task = this.runtime.automation.create({ ...input, steps: input.steps as never }); void this.runtime.automation.run(task.id); res.status(202).json({ ok: true, task });
    }));
    this.app.post("/api/tasks/:id/:command", route(async (req, res) => {
      const command = z.enum(["pause", "resume", "cancel"]).parse(req.params.command);
      const taskId = String(req.params.id);
      if (command === "pause") this.runtime.automation.pause(taskId);
      if (command === "cancel") this.runtime.automation.cancel(taskId);
      if (command === "resume") void this.runtime.automation.resume(taskId);
      res.json({ ok: true, task: this.runtime.automation.get(taskId) });
    }));
    this.app.post("/api/tests/run", route(async (req, res) => {
      const input = z.object({ agentId: z.string(), sessionId: z.string(), test: z.object({ name: z.string(), steps: z.array(z.object({ id: z.string(), action: actionSchema })), assertions: z.array(z.discriminatedUnion("type", [z.object({ type: z.literal("url_contains"), value: z.string() }), z.object({ type: z.literal("title_contains"), value: z.string() }), z.object({ type: z.literal("text_visible"), value: z.string() }), z.object({ type: z.literal("selector_visible"), value: z.string() })])) }) }).parse(req.body);
      res.json({ ok: true, run: await this.runtime.testing.run(input.test as never, input.agentId, input.sessionId) });
    }));
  }
}
