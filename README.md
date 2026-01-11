# myTV - Modular JavaScript Structure

## Overview

The application has been refactored into ES6 modules for better maintainability and separation of concerns.

## File Structure

```
myTV/
├── index.html          # Main HTML entry point
├── style.css           # Styles
├── script.js           # Legacy (kept for reference)
└── js/
    ├── main.js         # Entry point - initialization & event listeners
    ├── state.js        # Global state management
    ├── ui.js           # UI utilities (loading, menus, buttons)
    ├── player.js       # Video/audio playback & HLS handling
    └── channels.js     # Channel loading, parsing & display
```

## Modules

### `state.js`
Central state management for the application:
- Visibility states (picker, menu, filter)
- Media elements (video, audio, HLS instances)
- Intervals and timers
- Channel data

### `ui.js`
UI-related functions:
- Loading message overlay
- Side menu toggle
- Mute button handling
- Channel picker visibility
- Channel input display

### `player.js`
Playback functionality:
- `playStream()` - Single HLS stream playback
- `playVideoAndAudio()` - Dual stream playback
- HLS configuration and error handling
- Memory monitoring
- Media cleanup

### `channels.js`
Channel management:
- M3U playlist parsing
- Channel button creation
- Side menu population
- VLC headers for specific channels (Fox, Israeli channels)
- Channel filtering (Israel/US)

### `main.js`
Application entry point:
- Keyboard shortcuts (Escape, H, 0-9)
- Back button handler
- Initialization

## Adding VLC Headers for New Channels

To add VLC headers for a specific channel, edit `js/channels.js` and add the `tvg-id` to the `CHANNELS_REQUIRING_VLC_HEADERS` array:

```javascript
const CHANNELS_REQUIRING_VLC_HEADERS = [
  'FoxLiveNewsChannel.us',
  '12-kanal-il',
  '13-kanal-il',
  '13-kanal-il1',
  // Add new channel tvg-id here
];
```

## Running

Since this uses ES6 modules, you need to serve the files via HTTP (not file://).

```bash
# Using Python
python -m http.server 8000

# Using Node.js (npx)
npx serve .

# Using VS Code Live Server extension
# Right-click index.html → "Open with Live Server"
```

Then open http://localhost:8000 in your browser.
