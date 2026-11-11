#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./mcp.js";
import { ApiServer } from "./api.js";

const baseUrl = new URL(process.env.UB_BASE_URL ?? "http://127.0.0.1:3210");
let ownedDaemon: ApiServer | undefined;

async function daemonIsReady(): Promise<boolean> {
  try {
    const response = await fetch(new URL("/api/health", baseUrl), { signal: AbortSignal.timeout(800) });
    return response.ok;
  } catch {
    return false;
  }
}

if (!(await daemonIsReady())) {
  if (!['127.0.0.1', 'localhost', '::1'].includes(baseUrl.hostname)) {
    throw new Error(`Universal Browser daemon is unavailable at ${baseUrl.origin}.`);
  }
  ownedDaemon = new ApiServer({ host: baseUrl.hostname === "localhost" ? "127.0.0.1" : baseUrl.hostname, port: Number(baseUrl.port || 3210) });
  try { await ownedDaemon.start(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    ownedDaemon = undefined;
    let ready = false;
    for (let attempt = 0; attempt < 20 && !ready; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      ready = await daemonIsReady();
    }
    if (!ready) throw new Error(`Universal Browser port ${baseUrl.port || 3210} is occupied by another application.`);
  }
}

const server = createMcpServer({ baseUrl: baseUrl.origin });
await server.connect(new StdioServerTransport());

const shutdown = async () => {
  await server.close().catch(() => undefined);
  await ownedDaemon?.stop().catch(() => undefined);
};
process.stdin.once("end", () => { void shutdown(); });
process.once("SIGINT", () => { void shutdown().finally(() => process.exit(0)); });
process.once("SIGTERM", () => { void shutdown().finally(() => process.exit(0)); });
