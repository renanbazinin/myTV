## Context

myTV is a vanilla JS app for live TV streaming. The app hardcodes `isMuted = true` in `state.js` and `volume = 1` in `hls-player.js`. There's only a mute/unmute toggle button — no volume slider. When switching channels, audio resets. No user preferences are persisted.

## Goals / Non-Goals

**Goals:**
- Add a volume slider (`<input type="range">`) next to the existing mute button.
- Persist both volume level (0–1 float) and mute state (boolean) in localStorage.
- Restore on app init and apply on every channel switch.
- Keep autoplay-compatibility on first visit (start muted).
- Mute button click sets volume slider to 0 visually (and restores previous level on unmute).

**Non-Goals:**
- Per-channel volume presets.
- Persisting other preferences (quality, subtitles).
- Server-side storage.

## Decisions

**1. Two localStorage keys: `myTV_isMuted` and `myTV_volume`**
- `myTV_isMuted`: `"true"` / `"false"` string.
- `myTV_volume`: float string `"0"` to `"1"` (e.g., `"0.75"`).
- Why: Simple, independent values. Volume and mute are orthogonal — user may be muted at 80% volume.

**2. New state variable `currentVolume` in `state.js`**
- Initialized from localStorage, defaults to `1` if absent.
- All modules reference this for the current volume level.

**3. Volume slider as `<input type="range">` in header-controls**
- Placed between the mute button and "Support Me" button.
- Range: 0–100 (mapped to 0–1 for HTMLMediaElement.volume).
- Styled with CSS to match the glassmorphism theme.

**4. Bidirectional sync between slider and mute button**
- Dragging slider to 0 → auto-mutes (sets `isMuted = true`, updates button icon).
- Dragging slider above 0 while muted → auto-unmutes.
- Clicking mute button → slider moves to 0; clicking unmute → slider restores to `currentVolume`.

**5. Apply stored state in `playStream()` and `playVideoAndAudio()`**
- Replace hardcoded `muted = false; volume = 1` with `muted = isMuted; volume = currentVolume`.
- Update mute button icon to reflect current state.

## Risks / Trade-offs

- **[Autoplay on restore]** → Restoring unmuted state on page load could block autoplay. Mitigation: browsers usually remember user gesture grants per origin. Existing error recovery in hls-player retries if needed.
- **[localStorage unavailable]** → Private browsing. Mitigation: fallback to defaults (muted, volume=1). No crash path.
- **[Mobile touch UX]** → Range sliders can be fiddly on mobile. Mitigation: sufficient slider width and touch target size via CSS.
