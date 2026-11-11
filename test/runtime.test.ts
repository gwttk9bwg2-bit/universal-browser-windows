import { describe, expect, it } from "vitest";
import { BaseBrowserAdapter } from "../src/browser.js";
import { UniversalBrowserRuntime } from "../src/runtime.js";
import type { BrowserAction, BrowserSessionInfo } from "../src/types.js";

class FakeAdapter extends BaseBrowserAdapter {
  readonly info: BrowserSessionInfo = { id: "fake", name: "Fake", browser: "chromium", connection: "managed", state: "disconnected", humanControlled: false, connectedAt: new Date().toISOString(), capabilities: [] };
  async connect(){this.info.state="ready" as const} async disconnect(){this.info.state="disconnected" as const} async execute(action:BrowserAction){return { action }}
}
describe("runtime",()=>{it("allows reads but requires the write lock",async()=>{const r=new UniversalBrowserRuntime();await r.addAdapter(new FakeAdapter());expect(await r.execute({agentId:"a",sessionId:"fake",action:{type:"snapshot"}})).toBeTruthy();await expect(r.execute({agentId:"a",sessionId:"fake",action:{type:"navigate",url:"https://example.com"}})).rejects.toThrow(/lock/);r.agents.acquire("a");expect(await r.execute({agentId:"a",sessionId:"fake",action:{type:"navigate",url:"https://example.com"}})).toBeTruthy()})});
