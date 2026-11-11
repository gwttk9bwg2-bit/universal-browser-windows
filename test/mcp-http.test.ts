import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ApiServer } from "../src/api.js";

let api: ApiServer | undefined;
afterEach(async () => { await api?.stop(); api = undefined; });

describe("MCP Streamable HTTP", () => {
  it("negotiates and lists Universal Browser tools", async () => {
    api = new ApiServer({ port: 0 });
    const address = await api.start();
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://${address.host}:${address.port}/mcp`)));
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain("browser_status");
    expect(tools.tools.map((tool) => tool.name)).toContain("browser_connect");
    expect(tools.tools.map((tool) => tool.name)).toContain("browser_disconnect");
    expect(tools.tools.map((tool) => tool.name)).toContain("browser_observe");
    expect(tools.tools.map((tool) => tool.name)).toContain("browser_action");
    const browserAction = tools.tools.find((tool) => tool.name === "browser_action");
    expect(JSON.stringify(browserAction?.inputSchema)).toContain("click_at");
    expect(JSON.stringify(browserAction?.inputSchema)).toContain("drag_at");
    expect(JSON.stringify(browserAction?.inputSchema)).toContain("upload");
    expect(JSON.stringify(browserAction?.inputSchema)).toContain("download");
    const status = await client.callTool({ name: "browser_status", arguments: {} });
    expect(status.isError).not.toBe(true);
    expect(status.structuredContent).toMatchObject({ ok: true });
    await client.close();
  });
});
