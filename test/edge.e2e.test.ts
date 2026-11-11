import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { PlaywrightAdapter } from "../src/playwright-adapter.js";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
let adapter: PlaywrightAdapter | undefined;

describe.skipIf(!existsSync(edge))("real Edge", () => {
  afterEach(() => adapter?.disconnect());

  it("observes and controls a page through viewport coordinates", async () => {
    adapter = new PlaywrightAdapter({
      id: `e2e-${Date.now()}`,
      browser: "edge",
      executablePath: edge,
      headless: true,
      userDataDir: `.universal-browser/e2e-${Date.now()}`
    });
    await adapter.connect();
    await adapter.execute({
      type: "navigate",
      url: "data:text/html,<title>Universal Test</title><button id='ok' style='position:fixed;left:40px;top:50px;width:160px;height:60px' onclick=\"this.textContent='Clicked'\">Ready</button>"
    });

    const snap = await adapter.execute({ type: "snapshot" }) as { title: string; text: string };
    expect(snap.title).toBe("Universal Test");
    expect(snap.text).toContain("Ready");

    const accessibility = await adapter.execute({ type: "accessibility_snapshot" }) as { aria: string };
    expect(accessibility.aria).toContain("button \"Ready\"");

    const shot = await adapter.execute({ type: "screenshot", path: ".universal-browser/e2e.png" }) as {
      path: string; coordinateSpace: string; viewportWidth: number; viewportHeight: number; deviceScaleFactor: number
    };
    expect(existsSync(shot.path)).toBe(true);
    expect(shot.coordinateSpace).toBe("viewport");
    expect(shot.viewportWidth).toBeGreaterThan(0);
    expect(shot.viewportHeight).toBeGreaterThan(0);
    expect(shot.deviceScaleFactor).toBeGreaterThan(0);

    await adapter.execute({ type: "click_at", x: 120, y: 80 });
    const after = await adapter.execute({ type: "snapshot" }) as { text: string };
    expect(after.text).toContain("Clicked");
  }, 30_000);

  it("handles frames, shadow DOM, uploads, downloads, dialogs, waits, and popups", async () => {
    adapter = new PlaywrightAdapter({
      id: `full-${Date.now()}`,
      browser: "edge",
      headless: true,
      userDataDir: `.universal-browser/full-${Date.now()}`
    });
    await adapter.connect();
    const html = `<!doctype html><title>Full Surface</title>
      <iframe id="child" name="child" srcdoc="<button id='inside' onclick=&quot;this.textContent='Frame Clicked'&quot;>Frame Ready</button>"></iframe>
      <div id="host"></div><input id="file" type="file">
      <a id="download" download="hello.txt" href="data:text/plain,hello">Download</a>
      <button id="dialog" onclick="alert('Confirmed')">Dialog</button>
      <a id="popup" href="about:blank" target="_blank">Popup</a>
      <script>const root=document.querySelector('#host').attachShadow({mode:'open'});root.innerHTML='<input id="shadow-input"><button id="shadow-button">Shadow Ready</button>';</script>`;
    await adapter.execute({ type: "navigate", url: `data:text/html,${encodeURIComponent(html)}` });

    const snapshot = await adapter.execute({ type: "snapshot" }) as { frames: Array<{ text?: string }> };
    expect(snapshot.frames.some((frame) => frame.text?.includes("Frame Ready"))).toBe(true);
    await adapter.execute({ type: "click", selector: "#inside", frame: { selector: "#child" } });
    await adapter.execute({ type: "wait_for", text: "Frame Clicked", frame: { selector: "#child" } });

    await adapter.execute({ type: "type", selector: "#shadow-input", text: "shadow works" });
    expect(await adapter.execute({ type: "evaluate", expression: "document.querySelector('#host').shadowRoot.querySelector('#shadow-input').value" })).toBe("shadow works");

    await adapter.execute({ type: "upload", selector: "#file", paths: ["package.json"] });
    expect(await adapter.execute({ type: "evaluate", expression: "document.querySelector('#file').files[0].name" })).toBe("package.json");

    const downloadPath = `work/e2e-download-${Date.now()}.txt`;
    const download = await adapter.execute({ type: "download", selector: "#download", path: downloadPath }) as { path: string };
    expect(existsSync(download.path)).toBe(true);

    const dialog = await adapter.execute({ type: "click", selector: "#dialog", dialog: { accept: true } }) as { dialog: { message: string } };
    expect(dialog.dialog.message).toBe("Confirmed");

    const popup = await adapter.execute({ type: "click", selector: "#popup", expectPopup: true }) as { popup: { url: string } };
    expect(popup.popup.url).toBe("about:blank");
  }, 30_000);
});
