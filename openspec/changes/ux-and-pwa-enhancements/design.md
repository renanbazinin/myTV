## Context

myTV is a vanilla JS (ES6 modules) web app with no build system. All state lives in `state.js` globals. Keyboard handling is in `keyboard.js` with numeric input (0-9), ESC, and H keys. The channel list is fetched at runtime from a GitHub-hosted M3U and stored in `window.allChannels`. There is no existing service worker or manifest.

## Goals / Non-Goals

**Goals:**
- Enable TV-like channel navigation (up/down arrows, previous channel recall)
- Make all keyboard shortcuts discoverable via a help overlay
- Make the site installable as a PWA with offline static asset caching

**Non-Goals:**
- Offline video playback (streams require network)
- Push notifications
- Background sync or advanced PWA features
- Redesigning the existing channel grid or side menu

## Decisions

### 1. Channel navigation state in `state.js`

Track `currentChannelIndex` and `previousChannelIndex` as globals in `state.js`. When a channel plays, save the old index as previous. This keeps the pattern consistent with existing state management.

**Alternative**: Store in `localStorage` — rejected because this is session-scoped state, not persistent preference.

### 2. Help modal as inline HTML + CSS

Add the help modal markup directly in `index.html` (hidden by default) and style it in `style.css`. Toggle visibility from `keyboard.js` on `?` keypress and from a header button click.

**Alternative**: Dynamically create the modal in JS — rejected because static HTML is simpler, easier to maintain, and consistent with the no-build philosophy.

### 3. Service worker with cache-first for static assets

Use a simple service worker (`sw.js`) that:
- Pre-caches `index.html`, `style.css`, all `js/*.js` files, and the favicon on install
- Serves cached assets first, falling back to network
- Does NOT cache HLS streams or the M3U playlist (these must be fresh)

**Alternative**: Workbox library — rejected because it adds a dependency and the caching needs are simple enough for hand-written SW code.

### 4. Manifest with standalone display mode

Create `manifest.json` with `"display": "standalone"` so the installed app hides the browser chrome, giving a native TV feel.

### 5. Channel info overlay during quick-switch

When switching channels via arrow keys or Backspace, briefly show the channel name and number in an overlay (reuse the existing `#channel-input-display` pattern). Fade out after 2 seconds.

**Alternative**: Toast notification — rejected because the existing channel input display already establishes this pattern.

## Risks / Trade-offs

- **[Service worker caching stale assets]** → Mitigation: Use a cache version key; bump it on deploy. SW `activate` event deletes old caches.
- **[Arrow keys conflict with video player controls]** → Mitigation: Only handle arrow up/down when video is playing (not in picker view where scrolling matters). Left/right arrows left unbound.
- **[`?` key conflict with text input]** → Mitigation: No text inputs exist in the current UI (search is a future feature). If added later, suppress `?` handler when an input is focused.
