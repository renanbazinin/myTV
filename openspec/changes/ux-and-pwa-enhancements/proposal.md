## Why

myTV lacks several quality-of-life features that real TV experiences provide: quick channel switching (up/down, previous channel), discoverability of existing keyboard shortcuts, and the ability to install the app for a native-feeling experience. These are low-effort, high-impact improvements that make the site feel polished and complete.

## What Changes

- **Channel quick-switch**: Arrow key (up/down) channel navigation, a "previous channel" shortcut (Backspace), and a brief channel info overlay when switching.
- **Keyboard shortcuts help**: A `?` button in the header that opens a modal/overlay listing all available keyboard shortcuts.
- **PWA support**: A `manifest.json` and service worker to make the site installable as a standalone app, with offline caching of static assets and the channel list.

## Capabilities

### New Capabilities
- `channel-quick-switch`: Arrow key navigation between channels, previous-channel recall, and on-screen channel info display during switching.
- `keyboard-help`: A help overlay/modal showing all keyboard shortcuts, triggered by `?` key or a header button.
- `pwa-install`: Web app manifest and service worker enabling installation, home screen icon, and offline asset caching.

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- **Files modified**: `js/keyboard.js` (new shortcuts), `js/state.js` (previous channel tracking), `js/ui.js` (help modal), `index.html` (manifest link, service worker registration, help button), `style.css` (help modal styles)
- **New files**: `manifest.json`, `sw.js` (service worker)
- **Dependencies**: None — all browser-native APIs (Keyboard events, Service Worker, Web App Manifest)
- **No breaking changes**
