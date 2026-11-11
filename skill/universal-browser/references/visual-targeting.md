# Visual Targeting

Use visual targeting only after DOM selectors, browser accessibility, and Windows UI Automation fail or cannot see the target. A screenshot is an observation, not authority to perform a risky action.

## Browser viewport coordinates

`browser_observe` returns a screenshot plus `coordinateSpace: "viewport"`, `viewportWidth`, `viewportHeight`, and `deviceScaleFactor`. Browser actions accept CSS viewport coordinates, not raw bitmap pixels.

If the model locates point `(x_image, y_image)` in an image of size `(image_width, image_height)`, convert it as follows:

```text
x_css = x_image / image_width  * viewportWidth
y_css = y_image / image_height * viewportHeight
```

Then use `browser_action` with one of:

- `{"type":"click_at","x":x_css,"y":y_css}`
- `{"type":"scroll_at","x":x_css,"y":y_css,"deltaY":amount}`
- `{"type":"drag_at","fromX":x1,"fromY":y1,"toX":x2,"toY":y2}`

Do not multiply CSS coordinates by `deviceScaleFactor`; it explains bitmap density but the browser action already expects CSS pixels.

## Windows screen coordinates

Use `windows_action` only for native browser UI or another surface outside the page viewport. Its screenshot covers the Windows virtual screen. Use the returned virtual-screen origin and dimensions when available:

```text
x_screen = virtualLeft + x_image / image_width  * virtualWidth
y_screen = virtualTop  + y_image / image_height * virtualHeight
```

This matters on high-DPI and multi-monitor systems, including monitors positioned left of or above the primary display. Never mix viewport coordinates with screen coordinates.

## Localization decision

Before acting, form this internal result:

```json
{
  "found": true,
  "target": "short description",
  "confidence": 0.91,
  "bounds": { "x": 0, "y": 0, "width": 0, "height": 0 },
  "clickPoint": { "x": 0, "y": 0 },
  "evidence": ["visible label", "icon shape", "nearby context"]
}
```

- Confidence `>= 0.85`: an ordinary reversible click may proceed.
- Confidence `0.65–0.85`: re-observe, zoom/crop mentally, or corroborate with text/accessibility before acting.
- Confidence `< 0.65`: do not click. Ask the user or use another interaction route.
- Destructive, financial, account, credential, publishing, or other consequential actions always follow server approval and user-intent rules regardless of confidence.

Choose a point comfortably inside the target, usually its center. Avoid borders, overlapping overlays, scrollbars, resize handles, and adjacent controls.

## Verification and stopping

Immediately run `browser_observe` after a visual action and verify the intended state change using at least one observable signal: changed text, URL, accessibility state, control state, or screenshot.

If verification fails, take a fresh screenshot and localize again. Make at most two re-localization attempts for the same target. Then stop and ask the user rather than clicking nearby controls speculatively.

Coordinates become stale after any navigation, scroll, resize, zoom, tab switch, animation, popup, layout shift, or material content change. Never act on a stale screenshot.
