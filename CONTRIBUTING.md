# Contributing

Thank you for helping improve Universal Browser.

## Development

Requirements: Windows 10/11, Node.js 22+, and Microsoft Edge. Chrome and Firefox are useful for adapter testing.

```powershell
npm install
npm run check
npm run dev
```

Before opening a pull request:

1. Keep changes focused and avoid unrelated refactors.
2. Add or update tests for observable behavior.
3. Run `npm run check` on Windows.
4. Describe browser versions and which connection mode you tested.
5. Never commit browser profiles, cookies, tokens, screenshots containing private data, or generated native-host manifests.

Bug reports should include the Windows version, browser and version, connection mode (`managed`, `cdp`, or `extension`), exact reproduction steps, and redacted logs.
