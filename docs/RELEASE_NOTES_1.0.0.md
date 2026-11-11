# Universal Browser Windows 1.0.0

The first public release of Universal Browser Windows: a local-first MCP control plane that lets an AI agent observe and operate a browser through DOM, accessibility, screenshots, viewport coordinates, and real Windows input.

## Highlights

- One-click Windows installation with automatic Codex MCP and Skill configuration.
- Automatic discovery and launch of installed Edge, Chrome/Chromium, or Firefox browsers.
- Existing signed-in browser support through the optional extension/native-host bridge.
- DOM and ARIA observation, inline screenshots, visual-coordinate click/scroll/drag, tabs, navigation, typing, and selection.
- iframe and open Shadow DOM targeting, uploads, downloads, JavaScript dialogs, popup tabs, permission handling, and observable waits.
- Windows UI Automation plus real mouse, keyboard, focus, scrolling, dragging, and screen capture for native browser surfaces.
- Multi-agent write locking, human takeover, CAPTCHA pause, one-time approval tokens, redaction, and audit history.
- Repeatable automation, browser tests, network/WebSocket events, and HAR export.

## Install

1. Download `universal-browser-windows-1.0.0-portable.zip` from the assets below.
2. Extract it to a normal folder.
3. Double-click `install.cmd`.
4. Restart Codex and ask it to use the browser.

The Dashboard is optional. Run `connect-existing-browser.cmd` only when an agent needs an already signed-in Chrome or Edge profile.

## Update and removal

- Update from a newer extracted release with `update.cmd`.
- Remove the app and its installer-managed Codex configuration with `uninstall.cmd`.

## Verification

- TypeScript typecheck and production build pass.
- 10 test files pass locally.
- 15 tests pass locally, including real Microsoft Edge visual coordinates, frames, Shadow DOM, upload/download, dialogs, popups, Windows UI Automation, and zero-setup MCP connection.
- CI installs and tests Playwright Chromium and Firefox on Windows.
- Production dependency audit reports zero known vulnerabilities at release preparation time.

## Platform boundaries

CAPTCHA remains a human step. Browser-internal pages and native permission/file dialogs may require Windows fallback. Firefox extension uploads and JavaScript dialogs use managed mode or Windows fallback. These routes are explicit and audited rather than silently bypassed.

See [中文安装说明](INSTALL.zh-CN.md), [Architecture](ARCHITECTURE.md), and [Security](../SECURITY.md).
