# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

myTV ("RENAN TV") is a vanilla JavaScript live-TV web app for phones, PCs and TVs. It plays HLS streams from an M3U playlist. No framework and no dependencies: static files deployed by GitHub Pages (https://renanbazinin.github.io/myTV/).

**Two ways the same code runs** (the loader is the last inline script in `index.html`):
- Over http(s) (GitHub Pages, localhost) the browser loads the ES modules in `js/` directly. Locally: `npm start` (`python -m http.server 5173`, also in `.claude/launch.json`) and open http://localhost:5173/.
- Opened as a file (double-clicked `index.html`) browsers refuse ES modules, so it loads `js/app.bundle.js` instead: the same modules bundled into one classic script by `npm run build` (esbuild via npx). **After changing anything in `js/`, run `npm run build` and commit the bundle**; CI fails if it is stale. Never edit the bundle by hand. `?bundle=1` forces the bundle over http for testing.

URL switches: `?tv=1` / `?tv=0` force the layout, `?engine=hlsjs` / `?engine=native` force a playback engine.

## Compatibility floor (no transpiler — the modules ship as written)

Samsung Tizen 5+ (2019, Chromium 63), LG webOS 5+ (2020, Chromium 68), Android TV / Fire TV, Safari 12+, Firefox 68+. LG 2018–2019 sets (webOS 4.x, Chromium 53) are not supported; `index.html` shows a notice there.

- JS: ES2017 at most. Avoid `?.`, `??`, `catch {}` without a binding, object spread is OK (Chrome 60) but prefer `Object.assign`, no `import.meta`, `globalThis`, `replaceChildren`, `toggleAttribute`, `Array.prototype.flat/at`, `Object.fromEntries`, `replaceAll`, `Promise.allSettled`, regex named groups/lookbehind/`\p{}`, `inert`, `<dialog>`, `ResizeObserver`, `AbortController`, Pointer Events for gestures (use touch events). `focus({preventScroll})` only via `nav.focusQuietly()`. `MediaQueryList` listeners via `device.onMediaChange()`.
- CSS: no `inset` (write top/right/bottom/left), no flex `gap` (margins), `grid-gap` next to `gap`, no `aspect-ratio` (padding-top boxes), no `:focus-visible`/`:is()`/`:has()`, `env()` only through the `--safe-*` vars set inside `@supports`, focus rings with `box-shadow` (outline ignores border-radius before Chrome 94).
- Check before pushing (also what CI runs, `.github/workflows/syntax.yml`):
  ```
  npm test        # node --test: playlist parsing, key mapping, stream/logo URL rules
  npm run check   # es-check: every file must parse as ES2017
  npm run build   # regenerate js/app.bundle.js (the file:// copy)
  ```
  `package.json` exists only for these scripts; there are no dependencies.

## Architecture

`index.html` holds all markup (browse view, watch view, sheets, SVG icon sprite) plus an inline pre-paint script that sets `html.tv` and a boot watchdog (`#bootFail`). `js/main.js` is the only entry (as a module, or inside `js/app.bundle.js`).

Modules (lower layers never import higher ones):

- **config.js** — URLs, storage keys, timings, per-logo plate styles (`LOGO_STYLES`).
- **dom.js** — `h()` element builder, `icon()`, `$`/`$$`, `isVisible`, `isTypingTarget`.
- **store.js** — `state` object, localStorage helpers (all try/catch), favorites / last channel / preferences, tiny event bus (`on`/`emit`).
- **playlist.js** — M3U parse (display title after the first unquoted comma, `tvg-id` kept for logic), prettified names/groups, stable channel `key` = `tvg-id|lowercased title` (tvg-ids repeat), raw-text cache in localStorage (stale-while-revalidate).
- **streams.js** — per-channel URL resolution: i24News resolvers by `tvg-id` (Cloud Run live-edge proxy for `i24-il`, wiztivi API for en/fr/ar), Firefox HEVC→H.264 rewrite for `12-kanal-il`/`13-kanal-il`.
- **player.js** — playback engine on ONE persistent `<video id="video">` (re-creating it breaks PiP, iPhone fullscreen, AirPlay and iOS sound). Native HLS on Apple WebKit, lazily-loaded hls.js elsewhere. Bounded error recovery, tune timeout, autoplay-muted fallback (session-only, never persisted), live-edge jump after pauses, memory monitor, dual video+audio playback (`playVideoAndAudio`, currently unused by the playlist). Emits `player:*` events; builds no UI.
- **device.js** — TV detection (UA, `?tv=`, setting, `(pointer: none)`; never TV when the screen is portrait-ish), fullscreen / PiP / orientation helpers.
- **layers.js** — stack of closable layers (watch, channel list, sheets) mirrored in `history`. pushState only during real user input; popstate is what closes pushed layers; TV Back keys wait 200 ms for the browser's own history navigation so one press never closes two layers.
- **nav.js** — spatial (D-pad) navigation over `[data-nav]` inside the top scope, region memory (`data-nav-region="remember"`), scroll-into-view clear of sticky chrome, input modality (`html.kbd-nav` / `html.pointer-nav`).
- **keys.js** — keydown → action names; TV keyCodes (461 / 10009 Back, 403–406 colours, media keys), letters via `event.code` so shortcuts work on a Hebrew layout.
- **ui/browse.js** — guide: category tabs, "continue watching", channel sections/cards, search, favorites (☆, long-press, S / yellow key).
- **ui/watch.js** — player screen: HUD auto-hide, remote model (focus on `#stage` = arrows zap, OK = channel list; focus on a control = arrows navigate), zap debounce, channel list panel (docked under the video on phone portrait), gestures (swipe to zap), Media Session, PiP hand-off to the guide.
- **ui/overlays.js** — toasts, screen-reader announcer, modal sheets (focus trap, history layer), help tabs, channel-number OSD.
- **ui/settings.js**, **ui/logo.js** (logo plates + Wikimedia 330px thumbnails + imgur placeholder detection), **ui/clock.js**.

## Important Patterns

- **Channel data**: the playlist lives in a separate repo (`renanbazinin/myM3U`, `directLiveNamesDiffandEPG1.m3u`) and is fetched at runtime. A background refresh only re-renders lists; it never touches playback.
- **Zap order** stays inside the list a channel was started from (a category, favorites, search results, or all channels).
- **Remote keys are optional shortcuts**: Samsung's TV browser only delivers arrows, OK and Back to web pages, so every action has an on-screen control.
- **Service worker** (`sw.js`): network-first with `cache: 'no-cache'` revalidation, offline fallback only. Bump `CACHE_VERSION` and keep `STATIC_ASSETS` exactly in sync with the files (one 404 fails the install).
- **No third-party CORS proxies** (corsproxy.io was flagged by Safe Browsing) and no third-party iframes (mako.co.il embeds were removed for the same reason).

## Files Outside js/

- `style.css` — all styling: tokens on `:root`, breakpoints set `--cols` (2→8 columns), `html.tv` scales rem with the viewport (`font-size: 1.25vw`, an 80×45rem canvas).
- `script.js` — legacy monolithic script (pre-refactor). Not used.
- `indexUzi.html` — separate standalone page. Not part of the app.
