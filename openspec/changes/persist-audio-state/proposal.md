## Why

When switching (zapping) between channels, the audio state resets — the app always starts muted (`isMuted = true`) with volume hardcoded to `1`. Users must unmute every time they change channels. There is also no volume slider — only a binary mute/unmute button. Users want to set a comfortable volume level once and have it persist across channel switches and browser sessions.

## What Changes

- **Add a volume slider UI** next to the mute button in the header controls.
- **Store volume level and mute state in localStorage** whenever the user adjusts either.
- **Restore both values on app init** from localStorage instead of hardcoded defaults.
- **Apply stored audio state on channel switch** so zapping channels preserves the user's volume and mute preference.

## Capabilities

### New Capabilities
- `audio-persistence`: Persist the user's volume level (0–1) and mute state in localStorage. Restore across channel switches and page reloads. Add a volume slider control to the UI.

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- **`index.html`** — Add volume slider element next to mute button.
- **`style.css`** — Style the volume slider to match the glassmorphism theme.
- **`js/state.js`** — Add `currentVolume` variable; read both `isMuted` and `currentVolume` from localStorage on init.
- **`js/ui.js`** — `toggleMute()` writes mute state to localStorage; add volume slider input handler that writes volume to localStorage and applies to media elements.
- **`js/hls-player.js`** — Playback functions (`playStream`, `playVideoAndAudio`) apply stored mute and volume state instead of hardcoding values.
- No new dependencies. localStorage and range input are browser-native APIs.
