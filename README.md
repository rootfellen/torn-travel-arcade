# Torn Travel Arcade 🎮✈️

A free userscript for [Torn](https://www.torn.com) that adds a couple of tiny games to the Travel page, so long flights aren't so boring.

Click a small 🎮 button and play **Snake** or **2048** while you wait to land. Closed by default, drag it wherever you like, and it stays out of your way otherwise.

## What it does

On the **Travel** page (`torn.com/page.php?sid=travel`):

- A small floating **🎮 button**, closed by default. Click it to open the arcade panel.
- **Snake** and **2048**, switchable by tab. Each keeps its own progress and high score, so switching tabs doesn't reset the other.
- **Drag the button and the panel** anywhere on screen (drag the panel by its header). Both remember exactly where you left them, even after a page reload, and can't be dragged off-screen.
- Controls: **arrow keys or WASD**, **space** to restart. These are only captured while the panel is open, and never while you're typing in a real text field elsewhere on the page (like faction chat).
- Best scores are saved locally per game and persist between visits.
- Snake pauses automatically if you switch browser tabs, so it doesn't run in the background.

![screenshot](screenshot.png)
<!-- TODO: replace the line above with a real screenshot.png of the panel open, or delete it if you'd rather skip a screenshot -->

## Install

### Desktop browser (Chrome, Firefox, Edge, Safari)

1. Install a userscript manager: [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Open **[torn-travel-arcade.user.js](https://raw.githubusercontent.com/rootfellen/torn-travel-arcade/main/torn-travel-arcade.user.js)**. Your manager will offer to install it.
3. Go to the Travel page in Torn. The 🎮 button appears in the bottom-right corner.

Updates install automatically through your userscript manager.

### Torn PDA (mobile)

1. In Torn PDA, open **Settings → Advanced browser settings → User scripts**.
2. Add a new script and paste in the contents of `torn-travel-arcade.user.js`.
3. Set injection time to **End**, save, and open the Travel page.

## Is it allowed?

Yes. Torn's scripting rules allow scripts that use data from the API or from a page you loaded yourself and are currently viewing, as long as they make no extra non-API requests to Torn.

This script:

- ✅ is purely decorative — a UI overlay, same category as a page skin or a countdown timer script
- ✅ makes **zero** network requests (to Torn or anywhere else)
- ✅ needs **no API key**
- ✅ never reads or writes anything about your travel, cash, or account
- ✅ never clicks or submits anything on the page

## Privacy & security

Nothing is collected or sent anywhere. High scores and window positions are saved in your own browser's `localStorage` and never leave your device. See [SECURITY.md](SECURITY.md) for details, and the script is a single readable file if you'd like to check it yourself.

## Troubleshooting

| Problem | Fix |
|---|---|
| The 🎮 button doesn't appear | Make sure you're on `page.php?sid=travel` and the script is enabled in your userscript manager. |
| Arrow keys move my character/page instead of the game | Only happens if the panel isn't actually open — click the 🎮 button first. If it still happens with the panel open, [open an issue](https://github.com/rootfellen/torn-travel-arcade/issues). |
| I dragged the button/panel off-screen somehow | It's clamped to stay on-screen automatically, but if this happens, clear the `tta_toggle_pos` / `tta_panel_pos` keys from this site's local storage (dev tools → Application → Local Storage) to reset position. |

## Development

```bash
npm install
npx playwright install chromium
npm run check   # lint + browser tests
```

Players don't need any of this. It's only for working on the script.

## Feedback and contributions

Bug reports and ideas are welcome in [Issues](https://github.com/rootfellen/torn-travel-arcade/issues), or message me in Torn: **[0o0o0](https://www.torn.com/profiles.php?XID=4263920)**. Pull requests are welcome too, as long as changes stay within Torn's scripting rules (no automated actions, no extra requests).

## License

[MIT](LICENSE). Free to use, share and modify.

Made by **0o0o0** in Torn.
