# Complex Browser Interactions

Use these actions only when the ordinary observe-and-selector workflow needs them.

## Frames and Shadow DOM

Open Shadow DOM is traversed by managed browser locators and extension deep selectors. For iframe content, add a `frame` target to `click`, `type`, `select`, `upload`, `download`, or `wait_for`:

```json
{"type":"click","selector":"button.submit","frame":{"selector":"iframe#checkout"}}
```

The frame may instead use `name` or `urlContains`. Observe first: snapshots and accessibility output include child frames. Cross-origin extension frames are best targeted with `urlContains`; managed sessions support all three forms.

## Uploads

Uploads read a local file and therefore require explicit user confirmation plus a one-time approval token. Use:

```json
{"type":"upload","selector":"input[type=file]","paths":["C:\\absolute\\file.pdf"]}
```

Managed sessions and top-frame Chrome/Edge extension sessions can set the input directly. For Firefox extension sessions, framed upload inputs, or sites that expose only a native file chooser, click the chooser and use `windows_action` to enter the confirmed absolute path. Never guess a path or upload a file the user did not identify.

## Downloads

Use `download` instead of a plain click when a selector is expected to start a download. Managed sessions may set an exact `path`; extension sessions use the browser's configured download directory and return the resulting path. Verify the returned file path and failure state.

## Dialogs and popups

For JavaScript alert, confirm, or prompt, attach the response to the click that opens it:

```json
{"type":"click","selector":"button.confirm","dialog":{"accept":true,"promptText":"optional"}}
```

Set `expectPopup: true` when the click opens a new tab or window. The returned popup becomes the active managed page. Re-observe before continuing.

Firefox extension JavaScript dialogs and native browser permission dialogs require a managed session or `windows_action`. Never blindly accept a permission prompt; request approval when the permission exposes location, camera, microphone, notifications, clipboard, or local files.

## Waiting

Prefer `wait_for` over fixed sleeps. Wait for a stable selector, visible text, or URL fragment, then observe the resulting state. Use a narrow timeout and stop after repeated failure rather than looping indefinitely.
