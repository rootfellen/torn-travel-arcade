# Changelog

## 1.1.0 (2026-09-26)

- Playable on Torn PDA and other touch devices with no physical keyboard: on-screen arrow buttons under each game, plus swipe gestures directly on the game area
- Test suite grown to 32 browser tests to cover the new D-pad and swipe controls

## 1.0.0 (2026-09-26)

First public release.

- Floating 🎮 button on the Travel page, closed by default
- Snake and 2048, switchable by tab, each keeping its own progress and best score
- Draggable button and panel, remembered separately across page reloads and clamped to stay on-screen
- Arrow keys / WASD / space, captured only while the panel is open and never while typing in a real text field
- Snake pauses automatically when the browser tab isn't visible
- Full-screen blurred backdrop while the panel is open, so the Travel page fades out and the games stay in focus (click it to close, same as the ✕)
- No API key, no network requests, no data collected — everything lives in local storage on your device
- Dev tooling: ESLint (blocks network APIs and HTML injection), 27 browser tests, GitHub Actions CI
