import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ApiServer } from "../src/api.js";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
let api: ApiServer | undefined;
let client: Client | undefined;
const previousDataDirectory = process.env.UB_DATA_DIR;

afterEach(async () => {
  await client?.close().catch(() => undefined);
  await api?.stop().catch(() => undefined);
  client = undefined; api = undefined;
  if (previousDataDirectory === undefined) delete process.env.UB_DATA_DIR; else process.env.UB_DATA_DIR = previousDataDirectory;
});

describe.skipIf(!existsSync(edge))("MCP managed browser", () => {
  it("connects and disconnects an installed browser without manual setup", async () => {
    process.env.UB_DATA_DIR = resolve("work", "mcp-browser-e2e");
    api = new ApiServer({ port: 0 });
    const address = await api.start();
    client = new Client({ name: "browser-e2e", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://${address.host}:${address.port}/mcp`)));

    const connected = await client.callTool({ name: "browser_connect", arguments: { browser: "edge", headless: true } });
    expect(connected.isError).not.toBe(true);
    const body = connected.structuredContent as { session?: { id?: string; state?: string } };
    expect(body.session?.state).toBe("ready");
    expect(body.session?.id).toBeTruthy();

    const status = await client.callTool({ name: "browser_status", arguments: {} });
    expect(JSON.stringify(status.structuredContent)).toContain(body.session!.id!);

    const disconnected = await client.callTool({ name: "browser_disconnect", arguments: { sessionId: body.session!.id } });
    expect(disconnected.isError).not.toBe(true);
  }, 30_000);
});
