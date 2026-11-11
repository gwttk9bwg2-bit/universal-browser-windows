# Changelog

## 1.0.0

- Added automatic browser discovery and the `browser_connect` / `browser_disconnect` MCP workflow, so normal use no longer requires the Dashboard.
- Added iframe and open Shadow DOM observation and targeting across managed and extension sessions.
- Added managed upload, download, JavaScript dialog, popup, permission, and observable wait actions, with extension fallbacks where browser policy permits.
- Added extension frame routing, download completion tracking, Chromium file-input control, reconnect cleanup, and larger screenshot bridge messages.
- Added automatic Codex MCP configuration, isolated application data, one-click update/uninstall entry points, and reversible configuration backups.
- Added one-time approval creation for sensitive operations and complex-interaction guidance in the bundled Skill.
- Expanded real Edge coverage to visual coordinates, frames, Shadow DOM, upload/download, dialogs, popups, and zero-setup MCP browser connection.
- Added conditional Chromium and Firefox smoke tests and GitHub CI browser installation.

## 0.1.0

- Added managed Edge/Chromium and Firefox adapters plus CDP attachment.
- Added Chrome, Edge, and Firefox extension/native-host bridge.
- Added MCP stdio and Streamable HTTP transports.
- Added browser actions, DOM snapshots, screenshots, console/network/WebSocket observation, and HAR export.
- Added multi-agent locking, human takeover, approvals, redaction, and audit history.
- Added automation, browser testing, Dashboard, Windows scripts, diagnostics, and reusable AI Skill.
- Added one-command per-user installation, generated MCP configuration, automatic Codex Skill installation, and MCP-triggered daemon startup.
- Added authenticated native/MCP transports and automatic extension-session discovery.
- Added real Windows input fallback, UI Automation snapshots/actions, browser ARIA snapshots, and image-bearing MCP screenshots.
- Added `browser_observe` to combine DOM, accessibility, screenshot, and optional Windows UI Automation observations.
- Added viewport-coordinate click, scroll, and drag actions across managed and extension sessions, with DPI-aware screenshot metadata.
- Added visual-targeting confidence, coordinate conversion, verification, and safe-stop guidance to the bundled Skill.
- Added the MIT license for public GitHub distribution.
