# Security

## What this script can and can't do

- **No network access.** The script makes no requests to Torn or anywhere else. It has no `fetch`, `XMLHttpRequest` or `WebSocket` calls, and `@grant none` gives it no userscript-manager privileges. The linter blocks any network API from being added.
- **No API key.** It never asks for one and never reads one.
- **Reads nothing from Torn.** It doesn't read your cash, stats, travel status or anything else about your account. It only reads its own saved high scores and window positions.
- **Never acts for you.** It never clicks, submits or sends anything. Every game move happens entirely inside the panel, on your own screen.
- **No HTML injection.** Everything it shows is built with `textContent` and `canvas`, never `innerHTML`, so nothing from the page can run as code. This is enforced by the linter.
- **Keys only work while the panel is open.** Arrow keys and WASD are only captured when the arcade panel is visible, and never while you're typing in a real text field (chat, forms, etc.) elsewhere on the page.
- **Local settings only.** High scores and the button/panel's last position live in your browser's `localStorage`. They never leave your device.

## Verify it yourself

The whole script is one readable file: [`torn-travel-arcade.user.js`](torn-travel-arcade.user.js). Only install it from this repository or its official Greasy Fork page.

## Reporting a problem

Found a security issue? Please message [0o0o0 [4263920]](https://www.torn.com/profiles.php?XID=4263920) in Torn instead of opening a public issue.
