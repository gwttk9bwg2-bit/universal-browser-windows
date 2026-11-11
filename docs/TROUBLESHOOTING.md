# Troubleshooting

## The agent cannot see Universal Browser tools

Restart Codex after running `install.cmd`. The installer writes an isolated `universal-browser` block to `%USERPROFILE%\.codex\config.toml` and saves a backup before replacing an earlier installer-managed block.

Run `powershell -File scripts/diagnose-windows.ps1` from the extracted release to check Node.js, the production build, installed browsers, native messaging, and the local service.

## No browser session appears

Ask the agent to connect a browser, or call the MCP `browser_connect` tool. The service discovers installed browsers automatically. The Dashboard at `http://127.0.0.1:3210` is optional.

## I need my existing login

Run `connect-existing-browser.cmd` once and follow the extension prompt. After restarting the browser, the extension reconnects automatically whenever the MCP service starts.

## Upload or a browser dialog fails in Firefox extension mode

Use a managed Firefox session or the Windows fallback. Firefox extension policy does not expose every file-input or JavaScript-dialog mechanism available in managed automation.

## A CAPTCHA appears

Complete it manually. Universal Browser pauses the session and does not attempt to bypass human verification. Tell the agent to resume afterward.

## Port 3210 is occupied

Close the other local service using that port, or start Universal Browser with `universal-browser serve --port=PORT` and set `UB_BASE_URL` to the matching loopback URL.

## Safe reset

Run `uninstall.cmd`, then extract a fresh release and run `install.cmd` again. Uninstall removes only installer-managed files, native-host registration, Skill, and the marked Codex MCP block; it keeps configuration backups.
