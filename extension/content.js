const safeText = () => ({
  title: document.title,
  url: location.href,
  text: (document.body?.innerText || "").slice(0, 50000),
  links: [...document.querySelectorAll("a")].slice(0, 200).map((a) => ({ text: (a.textContent || "").trim(), href: a.href })),
  controls: [...document.querySelectorAll("button,input,select,textarea,[role=button]")].slice(0, 300).map((e) => ({
    tag: e.tagName.toLowerCase(), text: (e.textContent || "").trim(), ariaLabel: e.getAttribute("aria-label"), name: e.getAttribute("name"), type: e.getAttribute("type")
  }))
});

const viewportInfo = () => ({ coordinateSpace: "viewport", viewportWidth: innerWidth, viewportHeight: innerHeight, deviceScaleFactor: devicePixelRatio });

const accessibility = () => ({
  title: document.title, url: location.href, ...viewportInfo(),
  nodes: [...document.querySelectorAll("button,input,select,textarea,a,[role],[aria-label]")].slice(0, 500).map((e) => {
    const r = e.getBoundingClientRect();
    return {
      role: e.getAttribute("role") || ({ A: "link", BUTTON: "button", INPUT: "textbox", SELECT: "combobox", TEXTAREA: "textbox" }[e.tagName] || "generic"),
      name: e.getAttribute("aria-label") || (e.textContent || e.getAttribute("placeholder") || "").trim().slice(0, 500),
      disabled: e.matches(":disabled,[aria-disabled=true]"),
      bounds: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
    };
  })
});

const pointTarget = (x, y) => {
  const element = document.elementFromPoint(x, y);
  if (!element) throw Error(`No element at viewport point (${x}, ${y})`);
  return element;
};
const mouseEvent = (type, x, y, button = 0, buttons = 0) => new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button, buttons });
const queryDeep = (selector, root = document) => {
  const direct = root.querySelector(selector);
  if (direct) return direct;
  for (const element of root.querySelectorAll("*")) {
    if (!element.shadowRoot) continue;
    const nested = queryDeep(selector, element.shadowRoot);
    if (nested) return nested;
  }
  return null;
};
const frameDocument = (frame) => {
  if (!frame) return document;
  let iframe;
  if (frame.selector) iframe = queryDeep(frame.selector);
  else if (frame.name) iframe = [...document.querySelectorAll("iframe,frame")].find((item) => item.name === frame.name);
  else if (frame.urlContains) iframe = [...document.querySelectorAll("iframe,frame")].find((item) => item.src.includes(frame.urlContains));
  try { return iframe?.contentDocument || document; } catch { return document; }
};

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  (async () => {
    const a = msg.action;
    let result = { ok: true };
    if (a.type === "snapshot") result = safeText();
    else if (a.type === "accessibility_snapshot") result = accessibility();
    else if (a.type === "viewport_info") result = viewportInfo();
    else if (a.type === "click") { const e = queryDeep(a.selector, frameDocument(a.frame)); if (!e) throw Error("Element not found"); e.click(); }
    else if (a.type === "click_at") {
      const button = ({ left: 0, middle: 1, right: 2 })[a.button || "left"];
      const e = pointTarget(a.x, a.y);
      for (let i = 0; i < (a.clicks || 1); i += 1) {
        e.dispatchEvent(mouseEvent("mousedown", a.x, a.y, button, 1 << button));
        e.dispatchEvent(mouseEvent("mouseup", a.x, a.y, button, 0));
        e.dispatchEvent(mouseEvent(button === 2 ? "contextmenu" : "click", a.x, a.y, button, 0));
      }
    } else if (a.type === "scroll_at") {
      pointTarget(a.x ?? innerWidth / 2, a.y ?? innerHeight / 2).scrollIntoView({ block: "nearest", inline: "nearest" });
      scrollBy({ left: a.deltaX || 0, top: a.deltaY, behavior: "instant" });
    } else if (a.type === "drag_at") {
      pointTarget(a.fromX, a.fromY).dispatchEvent(mouseEvent("mousedown", a.fromX, a.fromY, 0, 1));
      pointTarget(a.toX, a.toY).dispatchEvent(mouseEvent("mousemove", a.toX, a.toY, 0, 1));
      pointTarget(a.toX, a.toY).dispatchEvent(mouseEvent("mouseup", a.toX, a.toY, 0, 0));
    } else if (a.type === "type") {
      const e = queryDeep(a.selector, frameDocument(a.frame)); if (!e) throw Error("Element not found"); e.focus(); e.value = a.text;
      e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true }));
      if (a.submit) e.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    } else if (a.type === "select") { const e = queryDeep(a.selector, frameDocument(a.frame)); if (!e) throw Error("Element not found"); e.value = a.value; e.dispatchEvent(new Event("change", { bubbles: true })); }
    else if (a.type === "wait_for") {
      const deadline = Date.now() + (a.timeoutMs || 15000);
      while (Date.now() < deadline) {
        const root = frameDocument(a.frame);
        const selectorReady = !a.selector || queryDeep(a.selector, root);
        const textReady = !a.text || (root.body?.innerText || "").includes(a.text);
        const urlReady = !a.urlContains || location.href.includes(a.urlContains);
        if (selectorReady && textReady && urlReady) { result = { ok: true, url: location.href, title: document.title }; break; }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!result.url) throw Error("Timed out waiting for the requested page state");
    }
    else if (a.type === "evaluate") result = { value: eval(a.expression) };
    send({ result });
  })().catch((e) => send({ error: e.message }));
  return true;
});

addEventListener("error", (e) => chrome.runtime.sendMessage({ kind: "console", level: "error", text: e.message }).catch(() => {}));
