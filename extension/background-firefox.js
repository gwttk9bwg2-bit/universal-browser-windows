const HOST = "com.universal_browser.bridge";
let port;

function connect() {
  try {
    port = browser.runtime.connectNative(HOST);
    port.onMessage.addListener(handle);
    port.onDisconnect.addListener(() => setTimeout(connect, 2000));
    port.postMessage({ kind: "hello", browser: "firefox", version: browser.runtime.getManifest().version });
  } catch { setTimeout(connect, 2000); }
}

async function active() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw Error("No active tab");
  return tab;
}

async function sendToTarget(tabId, action) {
  if (action.frame?.urlContains) {
    const frames = await browser.webNavigation.getAllFrames({ tabId });
    const frame = frames?.find((item) => item.url.includes(action.frame.urlContains));
    if (frame) return browser.tabs.sendMessage(tabId, { action: { ...action, frame: undefined } }, { frameId: frame.frameId });
  }
  return browser.tabs.sendMessage(tabId, { action });
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
  const frames = await browser.webNavigation.getAllFrames({ tabId }) || [];
  const observations = await Promise.all(frames.map(async (frame) => {
    try {
      const response = await browser.tabs.sendMessage(tabId, { action }, { frameId: frame.frameId });
      return { frameId: frame.frameId, parentFrameId: frame.parentFrameId, url: frame.url, ...(response.result || {}) };
    } catch (e) { return { frameId: frame.frameId, parentFrameId: frame.parentFrameId, url: frame.url, error: e.message }; }
  }));
  const main = observations.find((item) => item.frameId === 0) || {};
  return { ...main, frames: observations.filter((item) => item.frameId !== 0) };
}

async function clickWithPopup(tab, action) {
  if (action.dialog) throw Error("Firefox page dialogs require managed-browser mode or the Windows dialog fallback");
  const popupPromise = waitEvent(browser.tabs.onCreated, (created) => created.openerTabId === tab.id, 10000);
  await sendToTarget(tab.id, action);
  const popup = await popupPromise;
  return { ok: true, popup: { id: String(popup.id), url: popup.url, title: popup.title } };
}

async function downloadFromClick(tab, action) {
  const createdPromise = waitEvent(browser.downloads.onCreated, (item) => item.tabId === tab.id, 30000);
  await sendToTarget(tab.id, { type: "click", selector: action.selector, frame: action.frame });
  const item = await createdPromise;
  if (action.path) throw Error("Choosing an exact download path is supported in managed-browser mode; extension downloads use the browser download directory");
  await waitEvent(browser.downloads.onChanged, (delta) => delta.id === item.id && (delta.state?.current === "complete" || delta.error), 30000);
  const [completed] = await browser.downloads.search({ id: item.id });
  if (completed.error) throw Error(`Download failed: ${completed.error}`);
  return { ok: true, id: String(completed.id), path: completed.filename, suggestedFilename: completed.filename.split(/[\\/]/).pop(), url: completed.url };
}

async function handle(msg) {
  const { requestId, action } = msg;
  try {
    let result;
    if (action.type === "list_tabs") result = await browser.tabs.query({}).then((tabs) => tabs.map((tab) => ({ id: String(tab.id), url: tab.url, title: tab.title, active: tab.active })));
    else if (action.type === "navigate") result = await browser.tabs.update((await active()).id, { url: action.url });
    else if (action.type === "new_tab") result = await browser.tabs.create({ url: action.url || "about:blank" });
    else if (action.type === "close_tab") await browser.tabs.remove(action.tabId ? Number(action.tabId) : (await active()).id);
    else if (action.type === "reload") await browser.tabs.reload((await active()).id);
    else if (action.type === "back") await browser.tabs.goBack((await active()).id);
    else if (action.type === "forward") await browser.tabs.goForward((await active()).id);
    else if (action.type === "snapshot" || action.type === "accessibility_snapshot") result = await observeFrames((await active()).id, action);
    else if (action.type === "screenshot") {
      const tab = await active();
      const viewport = await browser.tabs.sendMessage(tab.id, { action: { type: "viewport_info" } });
      result = { dataUrl: await browser.tabs.captureVisibleTab(tab.windowId), ...(viewport.result || {}) };
    } else if (action.type === "click" && action.expectPopup) result = await clickWithPopup(await active(), action);
    else if (action.type === "download") result = await downloadFromClick(await active(), action);
    else if (action.type === "upload") throw Error("Firefox extension uploads require managed-browser mode or the Windows file-dialog fallback");
    else if (action.type === "grant_permissions") throw Error("Site permissions require managed-browser mode or the Windows permission-dialog fallback");
    else result = await sendToTarget((await active()).id, action);
    port.postMessage({ requestId, result });
  } catch (e) { port.postMessage({ requestId, error: e.message }); }
}

browser.webRequest.onBeforeRequest.addListener((d) => port?.postMessage({ kind: "network", phase: "request", url: d.url, method: d.method, resourceType: d.type }), { urls: ["<all_urls>"] });
browser.webRequest.onCompleted.addListener((d) => port?.postMessage({ kind: "network", phase: "response", url: d.url, status: d.statusCode, resourceType: d.type }), { urls: ["<all_urls>"] });
browser.webNavigation.onCommitted.addListener((d) => { if (d.frameId === 0) port?.postMessage({ kind: "page", event: "navigated", url: d.url, tabId: d.tabId }); });
connect();
