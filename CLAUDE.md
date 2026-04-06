# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

myTV is a vanilla JavaScript (ES6 modules) web app for streaming live TV channels via HLS. No build system, no framework, no package manager — static files served directly in the browser. Open `index.html` to run.

## Architecture

**Entry flow:** `index.html` loads scripts in dependency order → `main.js` calls init functions from each module on DOM ready.

**Module graph (`js/` directory):**

- **state.js** — Single global state object holding UI flags, media element references, HLS instances, and DOM element caches. All modules import from here.
- **utils.js** — Loading overlay, playback option normalization, spinner styling.
- **hls-player.js** — Core playback engine (~670 lines). Manages HLS.js initialization, dual video+audio stream support, buffer management, memory monitoring (Chrome memory API), error recovery, and stream synchronization.
- **channels.js** — Fetches an M3U playlist from GitHub (`renanbazinin/myM3U`), parses channel metadata (name, logo, URL, category), builds the channel grid UI, and handles channel-specific playback logic (iframe fallback for Mako, special headers for Israeli channels).
- **helperFetcher.js** — Dynamic URL resolution for protected channels (e.g., i24News via AWS Cognito auth). Handles CORS proxy wrapping and token caching.
- **ui.js** — Side menu toggle, mute button, channel picker visibility, event listener setup.
- **keyboard.js** — Numeric channel selection (1-99), ESC/h to toggle picker, on-screen input display.
- **main.js** — Thin entry point that coordinates module initialization.

## Key Dependencies (loaded via CDN in index.html)

- **HLS.js** — HLS stream playback (with native HLS fallback for Safari/iOS)
- **corsproxy.io** — CORS proxy used for fetching protected stream URLs

## Important Patterns

- **No build step**: All JS uses native ES6 `import`/`export`. Changes take effect on browser refresh.
- **Dual stream playback**: Some channels have separate video and audio streams that must be synchronized (handled in `hls-player.js`).
- **Browser-specific logic**: Firefox HEVC handling, Chrome memory API usage, Safari native HLS — conditional paths exist throughout `hls-player.js` and `channels.js`.
- **Channel data source**: M3U playlist fetched at runtime from a separate GitHub repo (`renanbazinin/myM3U`). Channel behavior is driven by metadata in that playlist.
- **CORS proxy**: `helperFetcher.js` wraps URLs with corsproxy.io when running locally; this is a key detail when debugging fetch failures.

## Files Outside js/

- `style.css` — All styling (~674 lines). Dark theme, glassmorphism, CSS variables, responsive grid layout.
- `script.js` — Legacy monolithic script (pre-refactor). Not used by `index.html` but kept in repo.
- `indexUzi.html` — Alternative HTML variant.
