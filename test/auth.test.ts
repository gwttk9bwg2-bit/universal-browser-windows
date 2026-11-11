import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { ApiServer } from "../src/api.js";

let server: ApiServer | undefined;
const previousToken = process.env.UB_TOKEN;

afterEach(async () => {
  await server?.stop();
  server = undefined;
  if (previousToken === undefined) delete process.env.UB_TOKEN; else process.env.UB_TOKEN = previousToken;
});

function opens(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new WebSocket(url);
    socket.once("open", () => { socket.close(); resolve(true); });
    socket.once("unexpected-response", () => { socket.terminate(); resolve(false); });
    socket.once("error", () => resolve(false));
  });
}

describe("local authentication", () => {
  it("protects MCP HTTP and the native bridge when a token is configured", async () => {
    process.env.UB_TOKEN = "test-local-token";
    server = new ApiServer({ port: 0 });
    const address = await server.start();
    const base = `http://${address.host}:${address.port}`;
    expect((await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(401);
    expect(await opens(`ws://${address.host}:${address.port}/native?id=bad`)).toBe(false);
    expect(await opens(`ws://${address.host}:${address.port}/native?id=good&token=test-local-token`)).toBe(true);
  });
});
