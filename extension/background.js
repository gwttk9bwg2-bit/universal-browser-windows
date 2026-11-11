const HOST = "com.universal_browser.bridge";
let port;

function connect() {
  try {
    port = chrome.runtime.connectNative(HOST);
    port.onMessage.addListener(handle);
    port.onDisconnect.addListener(() => setTimeout(connect, 2000));
    port.postMessage({ kind: "hello", browser: "chromium", version: chrome.runtime.getManifest().version });
  } catch { setTimeout(connect, 2000); }
}

async function active() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw Error("No active tab");
  return tab;
}

async function sendToTarget(tabId, action) {
  if (action.frame?.urlContains) {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    const frame = frames?.find((item) => item.url.includes(action.frame.urlContains));
    if (frame) return chrome.tabs.sendMessage(tabId, { action: { ...action, frame: undefined } }, { frameId: frame.frameId });
  }
  return chrome.tabs.sendMessage(tabId, { action });
}

function waitEvent(event, predicate, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { event.removeListener(listener); reject(Error("Browser event timed out")); }, timeoutMs);
    const listener = (...args) => {
      if (!predicate(...args)) return;
      clearTimeout(timer); event.removeListener(listener); resolve(args[0]);
    };
    event.addListener(listener);
  });
}

async function observeFrames(tabId, action) {
  const frames = await chrome.webNavigation.getAllFrames({ tabId }) || [];
  const observations = await Promise.all(frames.map(async (frame) => {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action }, { frameId: frame.frameId });
      return { frameId: frame.frameId, parentFrameId: frame.parentFrameId, url: frame.url, ...(response.result || {}) };
    } catch (e) { return { frameId: frame.frameId, parentFrameId: frame.parentFrameId, url: frame.url, error: e.message }; }
  }));
  const main = observations.find((item) => item.frameId === 0) || {};
  return { ...main, frames: observations.filter((item) => item.frameId !== 0) };
}

async function coordinateAction(tabId, action) {
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    if (action.type === "click_at") {
      const button = action.button || "left";
      for (let i = 1; i <= (action.clicks || 1); i += 1) {
        await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mousePressed", x: action.x, y: action.y, button, clickCount: i });
        await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseReleased", x: action.x, y: action.y, button, clickCount: i });
      }
    } else if (action.type === "scroll_at") {
      await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseWheel", x: action.x ?? 0, y: action.y ?? 0, deltaX: action.deltaX || 0, deltaY: action.deltaY });
    } else if (action.type === "drag_at") {
      await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mousePressed", x: action.fromX, y: action.fromY, button: "left", buttons: 1, clickCount: 1 });
      const steps = Math.max(2, Math.min(60, Math.round((action.durationMs || 500) / 16)));
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x: action.fromX + (action.toX - action.fromX) * t, y: action.fromY + (action.toY - action.fromY) * t, button: "left", buttons: 1 });
      }
      await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseReleased", x: action.toX, y: action.toY, button: "left", buttons: 0, clickCount: 1 });
    }
    return { ok: true };
  } finally { await chrome.debugger.detach(target).catch(() => {}); }
}

async function uploadWithDebugger(tabId, action) {
  if (action.frame) throw Error("Extension upload inside a frame requires the Windows file-dialog fallback");
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    const selector = JSON.stringify(action.selector);
    const expression = `(()=>{const q=(s,r=document)=>r.querySelector(s)||[...r.querySelectorAll('*')].map(e=>e.shadowRoot&&q(s,e.shadowRoot)).find(Boolean);return q(${selector})})()`;
    const evaluated = await chrome.debugger.sendCommand(target, "Runtime.evaluate", { expression, returnByValue: false });
    const objectId = evaluated?.result?.objectId;
    if (!objectId) throw Error("File input was not found");
    await chrome.debugger.sendCommand(target, "DOM.setFileInputFiles", { objectId, files: action.paths });
    return { ok: true, files: action.paths.length };
  } finally { await chrome.debugger.detach(target).catch(() => {}); }
}

async function clickWithOptions(tab, action) {
  const target = { tabId: tab.id };
  let dialogInfo;
  let dialogListener;
  if (action.dialog) {
    await chrome.debugger.attach(target, "1.3");
    await chrome.debugger.sendCommand(target, "Page.enable");
    dialogListener = async (source, method, params) => {
      if (source.tabId !== tab.id || method !== "Page.javascriptDialogOpening") return;
      dialogInfo = { type: params.type, message: params.message, defaultPrompt: params.defaultPrompt };
      await chrome.debugger.sendCommand(target, "Page.handleJavaScriptDialog", { accept: action.dialog.accept, promptText: action.dialog.promptText || "" });
    };
    chrome.debugger.onEvent.addListener(dialogListener);
  }
  const popupPromise = action.expectPopup ? waitEvent(chrome.tabs.onCreated, (created) => created.openerTabId === tab.id, 10000) : undefined;
  try {
    await sendToTarget(tab.id, action);
    const popup = await popupPromise;
    return { ok: true, dialog: dialogInfo, popup: popup ? { id: String(popup.id), url: popup.url, title: popup.title } : undefined };
  } finally {
    if (dialogListener) chrome.debugger.onEvent.removeListener(dialogListener);
    if (action.dialog) await chrome.debugger.detach(target).catch(() => {});
  }
}

async function downloadFromClick(tab, action) {
  const createdPromise = waitEvent(chrome.downloads.onCreated, (item) => item.tabId === tab.id, 30000);
  await sendToTarget(tab.id, { type: "click", selector: action.selector, frame: action.frame });
  const item = await createdPromise;
  if (action.path) throw Error("Choosing an exact download path is supported in managed-browser mode; extension downloads use the browser download directory");
  await waitEvent(chrome.downloads.onChanged, (delta) => delta.id === item.id && (delta.state?.current === "complete" || delta.error), 30000);
  const [completed] = await chrome.downloads.search({ id: item.id });
  if (completed.error) throw Error(`Download failed: ${completed.error}`);
  return { ok: true, id: String(completed.id), path: completed.filename, suggestedFilename: completed.filename.split(/[\\/]/).pop(), url: completed.url };
}

async function handle(msg) {
  const { requestId, action } = msg;
  try {
    let result;
    if (action.type === "list_tabs") result = await chrome.tabs.query({}).then((tabs) => tabs.map((tab) => ({ id: String(tab.id), url: tab.url, title: tab.title, active: tab.active })));
    else if (action.type === "navigate") { const tab = await active(); result = await chrome.tabs.update(tab.id, { url: action.url }); }
    else if (action.type === "new_tab") result = await chrome.tabs.create({ url: action.url || "about:blank" });
    else if (action.type === "close_tab") await chrome.tabs.remove(action.tabId ? Number(action.tabId) : (await active()).id);
    else if (action.type === "reload") await chrome.tabs.reload((await active()).id);
    else if (action.type === "back") await chrome.tabs.goBack((await active()).id);
    else if (action.type === "forward") await chrome.tabs.goForward((await active()).id);
    else if (action.type === "snapshot" || action.type === "accessibility_snapshot") {
      result = await observeFrames((await active()).id, action);
    } else if (action.type === "screenshot") {
      const tab = await active();
      const viewport = await chrome.tabs.sendMessage(tab.id, { action: { type: "viewport_info" } });
      result = { dataUrl: await chrome.tabs.captureVisibleTab(tab.windowId), ...(viewport.result || {}) };
    } else if (["click_at", "scroll_at", "drag_at"].includes(action.type)) {
      const tab = await active();
      try { result = await coordinateAction(tab.id, action); }
      catch { result = await sendToTarget(tab.id, action); }
    } else if (action.type === "click" && (action.dialog || action.expectPopup)) {
      result = await clickWithOptions(await active(), action);
    } else if (action.type === "upload") {
      result = await uploadWithDebugger((await active()).id, action);
    } else if (action.type === "download") {
      result = await downloadFromClick(await active(), action);
    } else if (action.type === "grant_permissions") {
      throw Error("Site permissions require managed-browser mode or the Windows permission-dialog fallback");
    } else if (action.type === "press") {
      const tab = await active();
      result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (key) => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })), args: [action.key] });
    } else { const tab = await active(); result = await sendToTarget(tab.id, action); }
    port.postMessage({ requestId, result });
  } catch (e) { port.postMessage({ requestId, error: e.message }); }
}

chrome.webRequest.onBeforeRequest.addListener((d) => port?.postMessage({ kind: "network", phase: "request", url: d.url, method: d.method, resourceType: d.type }), { urls: ["<all_urls>"] });
chrome.webRequest.onCompleted.addListener((d) => port?.postMessage({ kind: "network", phase: "response", url: d.url, status: d.statusCode, resourceType: d.type }), { urls: ["<all_urls>"] });
chrome.webNavigation.onCommitted.addListener((d) => { if (d.frameId === 0) port?.postMessage({ kind: "page", event: "navigated", url: d.url, tabId: d.tabId }); });
connect();
