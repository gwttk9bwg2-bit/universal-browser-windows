import { mkdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { chromium, firefox, type Browser, type BrowserContext, type Locator, type Page } from "playwright-core";
import { BaseBrowserAdapter } from "./browser.js";
import type { BrowserAction, BrowserKind, BrowserSessionInfo, FrameTarget } from "./types.js";
import { errorMessage, now } from "./util.js";
import { findBrowserExecutable } from "./browsers.js";
import { dataDirectory } from "./paths.js";

export interface PlaywrightAdapterOptions {
  id: string;
  name?: string;
  browser: BrowserKind;
  endpoint?: string;
  executablePath?: string;
  userDataDir?: string;
  headless?: boolean;
}

export class PlaywrightAdapter extends BaseBrowserAdapter {
  readonly info: BrowserSessionInfo;
  #browser?: Browser;
  #context?: BrowserContext;
  #page?: Page;

  constructor(private readonly options: PlaywrightAdapterOptions) {
    super();
    this.info = {
      id: options.id,
      name: options.name ?? `${options.browser} browser`,
      browser: options.browser,
      connection: options.endpoint ? "cdp" : "managed",
      state: "disconnected",
      humanControlled: false,
      connectedAt: now(),
      capabilities: ["tabs", "dom", "input", "screenshot", "console", "network", "downloads"]
    };
  }

  async connect(): Promise<void> {
    this.info.state = "connecting";
    try {
      if (this.options.endpoint) {
        if (this.options.browser === "firefox") throw new Error("Firefox does not support CDP attachment; use the extension or managed mode.");
        this.#browser = await chromium.connectOverCDP(this.options.endpoint, { timeout: 15_000 });
        this.#context = this.#browser.contexts()[0];
        if (!this.#context) throw new Error("Connected browser has no default context.");
      } else {
        const browserType = this.options.browser === "firefox" ? firefox : chromium;
        const executablePath = this.options.executablePath ?? findBrowserExecutable(this.options.browser);
        if (!executablePath) throw new Error(`No installed ${this.options.browser} browser was found. Install it or provide executablePath.`);
        const userDataDir = this.options.userDataDir ?? resolve(dataDirectory(), "profiles", this.options.id);
        await mkdir(userDataDir, { recursive: true });
        this.#context = await browserType.launchPersistentContext(userDataDir, {
          executablePath,
          headless: this.options.headless ?? false,
          viewport: null,
          args: this.options.browser === "firefox" ? [] : ["--remote-debugging-port=0"]
        });
      }
      this.#page = this.#context.pages()[0] ?? await this.#context.newPage();
      this.#wireContext(this.#context);
      this.#updatePage(this.#page);
      this.info.state = "ready";
    } catch (error) {
      this.info.state = "error";
      this.info.error = errorMessage(error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.#context?.close().catch(() => undefined);
    await this.#browser?.close().catch(() => undefined);
    this.info.state = "disconnected";
  }

  async execute(action: BrowserAction): Promise<unknown> {
    const page = await this.#activePage();
    switch (action.type) {
      case "list_tabs":
        return Promise.all(this.#context!.pages().map(async (p, index) => ({ id: String(index), url: p.url(), title: await p.title() })));
      case "snapshot":
        return page.locator("body").evaluate((body) => ({
          title: document.title,
          url: location.href,
          text: ((body as HTMLElement).innerText || body.textContent || "").slice(0, 50_000),
          links: [...document.querySelectorAll("a")].slice(0, 200).map((a) => ({ text: (a.textContent || "").trim(), href: (a as HTMLAnchorElement).href })),
          controls: [...document.querySelectorAll("button,input,select,textarea,[role=button]")].slice(0, 300).map((e) => ({
            tag: e.tagName.toLowerCase(), text: (e.textContent || "").trim(), ariaLabel: e.getAttribute("aria-label"), name: e.getAttribute("name"), type: e.getAttribute("type")
          }))
        })).then(async (main) => ({ ...main, frames: await this.#frameSnapshots(page) }));
      case "accessibility_snapshot": {
        const frames = await Promise.all(page.frames().filter((frame) => frame !== page.mainFrame()).map(async (frame) => {
          try { return { name: frame.name(), url: frame.url(), aria: await frame.locator("body").ariaSnapshot() }; }
          catch (error) { return { name: frame.name(), url: frame.url(), error: errorMessage(error) }; }
        }));
        return { title: await page.title(), url: page.url(), aria: await page.locator("body").ariaSnapshot(), frames };
      }
      case "screenshot": {
        const path = action.path ? resolve(action.path) : resolve(dataDirectory(), "screenshots", `${Date.now()}.png`);
        await mkdir(dirname(path), { recursive: true });
        await page.screenshot({ path, fullPage: action.fullPage ?? false });
        const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight, deviceScaleFactor: devicePixelRatio }));
        return { path, coordinateSpace: action.fullPage ? "document" : "viewport", viewportWidth: viewport.width, viewportHeight: viewport.height, documentWidth: viewport.documentWidth, documentHeight: viewport.documentHeight, deviceScaleFactor: viewport.deviceScaleFactor };
      }
      case "navigate": await page.goto(action.url, { waitUntil: "domcontentloaded" }); break;
      case "click": {
        const dialogPromise = action.dialog ? page.waitForEvent("dialog", { timeout: 10_000 }).then(async (dialog) => {
          const info = { type: dialog.type(), message: dialog.message(), defaultValue: dialog.defaultValue() };
          if (action.dialog?.accept) await dialog.accept(action.dialog.promptText); else await dialog.dismiss();
          return info;
        }) : undefined;
        const popupPromise = action.expectPopup ? page.waitForEvent("popup", { timeout: 10_000 }) : undefined;
        await this.#locator(page, action.selector, action.frame).click();
        const dialog = await dialogPromise;
        const popup = await popupPromise;
        if (popup) { this.#page = popup; await popup.waitForLoadState("domcontentloaded").catch(() => undefined); }
        if (dialog || popup) {
          const active = this.#page ?? page;
          this.#updatePage(active);
          return { ok: true, dialog, popup: popup ? { url: popup.url(), title: await popup.title() } : undefined };
        }
        break;
      }
      case "click_at":
        await page.mouse.click(action.x, action.y, { button: action.button ?? "left", clickCount: action.clicks ?? 1 });
        break;
      case "scroll_at":
        if (action.x !== undefined && action.y !== undefined) await page.mouse.move(action.x, action.y);
        await page.mouse.wheel(action.deltaX ?? 0, action.deltaY);
        break;
      case "drag_at": {
        const steps = Math.max(2, Math.min(60, Math.round((action.durationMs ?? 500) / 16)));
        await page.mouse.move(action.fromX, action.fromY);
        await page.mouse.down();
        await page.mouse.move(action.toX, action.toY, { steps });
        await page.mouse.up();
        break;
      }
      case "type":
        await this.#locator(page, action.selector, action.frame).fill(action.text);
        if (action.submit) await this.#locator(page, action.selector, action.frame).press("Enter");
        break;
      case "press": await page.keyboard.press(action.key); break;
      case "select": await this.#locator(page, action.selector, action.frame).selectOption(action.value); break;
      case "upload":
        await this.#locator(page, action.selector, action.frame).setInputFiles(action.paths.map((path) => resolve(path)));
        break;
      case "download": {
        const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
        await this.#locator(page, action.selector, action.frame).click();
        const download = await downloadPromise;
        const path = action.path ? resolve(action.path) : resolve(dataDirectory(), "downloads", basename(download.suggestedFilename()));
        await mkdir(dirname(path), { recursive: true });
        await download.saveAs(path);
        const failure = await download.failure();
        if (failure) throw new Error(`Download failed: ${failure}`);
        return { ok: true, path, suggestedFilename: download.suggestedFilename(), url: download.url() };
      }
      case "grant_permissions":
        await this.#context!.grantPermissions(action.permissions, action.origin ? { origin: action.origin } : undefined);
        break;
      case "wait_for": {
        const timeout = action.timeoutMs ?? 15_000;
        if (action.urlContains) await page.waitForURL((url) => url.href.includes(action.urlContains!), { timeout });
        if (action.selector) await this.#locator(page, action.selector, action.frame).waitFor({ state: "visible", timeout });
        if (action.text) await this.#locator(page, `text=${action.text}`, action.frame).waitFor({ state: "visible", timeout });
        return { ok: true, url: page.url(), title: await page.title() };
      }
      case "evaluate": return page.evaluate((expression) => globalThis.eval(expression), action.expression);
      case "back": await page.goBack(); break;
      case "forward": await page.goForward(); break;
      case "reload": await page.reload(); break;
      case "new_tab": this.#page = await this.#context!.newPage(); if (action.url) await this.#page.goto(action.url); break;
      case "close_tab": {
        const pages = this.#context!.pages();
        const target = action.tabId ? pages[Number(action.tabId)] : page;
        if (!target) throw new Error("Tab not found.");
        await target.close();
        this.#page = this.#context!.pages().at(-1);
        break;
      }
      default: action satisfies never;
    }
    if (this.#page) this.#updatePage(this.#page);
    return { ok: true, url: this.#page?.url(), title: await this.#page?.title() };
  }

  async #activePage(): Promise<Page> {
    if (!this.#context) throw new Error("Browser is not connected.");
    const pages = this.#context.pages();
    this.#page = pages.find((p) => !p.isClosed() && p.url() !== "about:blank") ?? pages.at(-1) ?? await this.#context.newPage();
    return this.#page;
  }

  #locator(page: Page, selector: string, frame?: FrameTarget): Locator {
    if (!frame) return page.locator(selector);
    if (frame.selector) return page.frameLocator(frame.selector).locator(selector);
    const target = page.frames().find((candidate) =>
      candidate !== page.mainFrame() &&
      (!frame.name || candidate.name() === frame.name) &&
      (!frame.urlContains || candidate.url().includes(frame.urlContains))
    );
    if (!target) throw new Error("Target frame was not found.");
    return target.locator(selector);
  }

  async #frameSnapshots(page: Page): Promise<Array<Record<string, unknown>>> {
    return Promise.all(page.frames().filter((frame) => frame !== page.mainFrame()).map(async (frame) => {
      try {
        const content = await frame.locator("body").evaluate((body) => ({
          text: ((body as HTMLElement).innerText || body.textContent || "").slice(0, 25_000),
          controls: [...document.querySelectorAll("button,input,select,textarea,[role=button]")].slice(0, 150).map((element) => ({
            tag: element.tagName.toLowerCase(), text: (element.textContent || "").trim(), ariaLabel: element.getAttribute("aria-label"), name: element.getAttribute("name"), type: element.getAttribute("type")
          }))
        }));
        return { name: frame.name(), url: frame.url(), ...content };
      } catch (error) { return { name: frame.name(), url: frame.url(), error: errorMessage(error) }; }
    }));
  }

  #wireContext(context: BrowserContext): void {
    context.on("page", (page) => {
      this.#page = page;
      this.#wirePage(page);
      this.emitBrowser("page", { event: "opened", url: page.url() });
    });
    context.on("request", (request) => this.emitBrowser("network", { phase: "request", method: request.method(), url: request.url(), resourceType: request.resourceType() }));
    context.on("response", (response) => this.emitBrowser("network", { phase: "response", status: response.status(), url: response.url(), headers: response.headers() }));
    for (const page of context.pages()) this.#wirePage(page);
  }

  #wirePage(page: Page): void {
    page.on("console", (message) => this.emitBrowser("console", { level: message.type(), text: message.text() }));
    page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) { this.#updatePage(page); this.emitBrowser("page", { event: "navigated", url: frame.url() }); } });
    page.on("websocket", (socket) => {
      this.emitBrowser("websocket", { event: "opened", url: socket.url() });
      socket.on("framesent", (event) => this.emitBrowser("websocket", { event: "sent", url: socket.url(), payload: String(event.payload).slice(0, 4096) }));
      socket.on("framereceived", (event) => this.emitBrowser("websocket", { event: "received", url: socket.url(), payload: String(event.payload).slice(0, 4096) }));
    });
  }

  #updatePage(page: Page): void {
    this.info.activeUrl = page.url();
    void page.title().then((title) => { this.info.activeTitle = title; }).catch(() => undefined);
  }
}
