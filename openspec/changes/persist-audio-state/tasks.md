## 1. State Layer

- [x] 1.1 In `js/state.js`, add `currentVolume` variable initialized from `localStorage.getItem('myTV_volume')` (default `1`). Change `isMuted` init to read from `localStorage.getItem('myTV_isMuted')` (default `true`).

## 2. Volume Slider UI

- [x] 2.1 In `index.html`, add `<input type="range" id="volumeSlider" min="0" max="100" value="100">` inside `.header-controls`, between the mute button and support button.
- [x] 2.2 In `style.css`, add styles for `#volumeSlider` matching the glassmorphism theme (track, thumb, hover states).

## 3. UI Logic

- [x] 3.1 In `js/ui.js`, add `setVolume(value)` function that updates `currentVolume`, applies to media elements, writes to localStorage, and syncs mute state/button when slider hits 0 or moves above 0.
- [x] 3.2 In `js/ui.js`, update `toggleMute()` to write mute state to localStorage, and sync slider position (0 when muted, restore `currentVolume` when unmuted).
- [x] 3.3 In `js/ui.js` `initUiEventListeners()`, add input event listener for `#volumeSlider` and initialize slider position from `currentVolume` state.

## 4. Playback Integration

- [x] 4.1 In `js/hls-player.js` `playStream()`, replace hardcoded `videoElement.muted = false; isMuted = false` with `videoElement.muted = isMuted; videoElement.volume = currentVolume`. Update mute button icon to reflect current state.
- [x] 4.2 In `js/hls-player.js` `playVideoAndAudio()`, replace hardcoded mute/volume on both video and audio elements with current `isMuted` and `currentVolume` values. Update mute button icon to reflect current state.

## 5. Verification

- [x] 5.1 Manual test: adjust volume slider → switch channel → confirm volume level and slider position preserved.
- [x] 5.2 Manual test: mute → switch channel → confirm stays muted with slider at 0.
- [x] 5.3 Manual test: set volume to 60%, reload page → confirm volume restored at 60% and slider shows 60%.
- [x] 5.4 Manual test: drag slider to 0 → confirm auto-mutes; drag above 0 → confirm auto-unmutes.
