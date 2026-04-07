## 1. Channel Quick-Switch State

- [x] 1.1 Add `currentChannelIndex` and `previousChannelIndex` globals to `state.js`
- [x] 1.2 Update `playChannelFromMenu` in `channels.js` to set `previousChannelIndex = currentChannelIndex` and then `currentChannelIndex = index` on every channel play

## 2. Channel Quick-Switch Keyboard Handlers

- [x] 2.1 Add ArrowUp/ArrowDown handlers in `keyboard.js` — only when `!isPickerVisible`, navigate to next/prev channel with wrap-around using `window.allChannels` and `playChannelFromMenu`
- [x] 2.2 Add Backspace handler in `keyboard.js` — switch to `previousChannelIndex` if set
- [x] 2.3 Add channel info overlay: show channel number + name briefly (2s fade) when switching via arrows/Backspace/numeric — reuse `#channel-input-display` element or add a new overlay element

## 3. Keyboard Help Overlay

- [x] 3.1 Add help modal HTML to `index.html` (hidden by default) listing all shortcuts: 0-9, ArrowUp/Down, Backspace, H, Escape, ?
- [x] 3.2 Add `?` button to header controls in `index.html`
- [x] 3.3 Add help modal styles to `style.css` (backdrop, centered card, glassmorphism consistent with existing design)
- [x] 3.4 Add toggle logic in `keyboard.js`: `?` key toggles help, Escape closes it, backdrop click closes it; wire up header button click

## 4. PWA — Manifest

- [x] 4.1 Create `manifest.json` with app name, icons (reuse existing favicon), theme/background colors matching dark theme, `display: standalone`, `start_url: ./`
- [x] 4.2 Add `<link rel="manifest" href="manifest.json">` and theme-color meta tag to `index.html`

## 5. PWA — Service Worker

- [x] 5.1 Create `sw.js` with cache-first strategy for static assets (`index.html`, `style.css`, `js/*.js`, favicon), versioned cache key, and old cache cleanup on activate
- [x] 5.2 Add service worker registration script to `index.html` (with feature detection)
