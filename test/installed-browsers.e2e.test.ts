import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { PlaywrightAdapter } from "../src/playwright-adapter.js";
import type { BrowserKind } from "../src/types.js";
import { chromium, firefox } from "playwright-core";

const candidates: Array<{ name: string; browser: BrowserKind; path: string }> = [
  { name: "Microsoft Edge", browser: "edge", path: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" },
  { name: "Google Chrome", browser: "chrome", path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" },
  { name: "Playwright Chromium", browser: "chromium", path: chromium.executablePath() },
  { name: "Mozilla Firefox", browser: "firefox", path: "C:\\Program Files\\Mozilla Firefox\\firefox.exe" },
  { name: "Playwright Firefox", browser: "firefox", path: firefox.executablePath() }
];
let adapter: PlaywrightAdapter | undefined;
afterEach(() => adapter?.disconnect());

describe.each(candidates)("$name smoke test", ({ browser, path }) => {
  it.skipIf(!existsSync(path))("navigates, observes, and clicks", async () => {
    adapter = new PlaywrightAdapter({ id: `${browser}-${Date.now()}`, browser, executablePath: path, headless: true, userDataDir: `.universal-browser/${browser}-${Date.now()}` });
    await adapter.connect();
    await adapter.execute({ type: "navigate", url: "data:text/html,<title>Browser Smoke</title><button onclick=\"this.textContent='Done'\">Ready</button>" });
    await adapter.execute({ type: "click", selector: "button" });
    const snapshot = await adapter.execute({ type: "snapshot" }) as { title: string; text: string };
    expect(snapshot.title).toBe("Browser Smoke");
    expect(snapshot.text).toContain("Done");
  }, 30_000);
});
