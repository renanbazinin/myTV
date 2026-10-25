// keys.js - Normalise keyboard and TV-remote keys into app actions
//
// TV browsers report remote buttons inconsistently: some send standard `key`
// names, older engines only a numeric keyCode (LG webOS Back = 461, Samsung
// Tizen Return = 10009, colour keys 403-406, media keys 412-417). Websites on
// Samsung TVs only reliably get arrows, OK and Back, so every action here is
// also reachable on screen.
//
// Letter shortcuts fall back to the physical key (event.code), so they keep
// working with a Hebrew (or any non-Latin) keyboard layout.

const BY_KEY = {
    ArrowUp: 'up', Up: 'up',
    ArrowDown: 'down', Down: 'down',
    ArrowLeft: 'left', Left: 'left',
    ArrowRight: 'right', Right: 'right',
    Enter: 'ok', Accept: 'ok', Select: 'ok',
    Escape: 'escape', Esc: 'escape',
    GoBack: 'back', XF86Back: 'back',
    BrowserBack: 'browser-back',
    Backspace: 'backspace',
    ChannelUp: 'channel-up', MediaTrackNext: 'channel-up', MediaNextTrack: 'channel-up', MediaFastForward: 'channel-up',
    ChannelDown: 'channel-down', MediaTrackPrevious: 'channel-down', MediaPreviousTrack: 'channel-down', MediaRewind: 'channel-down',
    PageUp: 'page-up', PageDown: 'page-down',
    MediaPlayPause: 'play-pause', MediaPlay: 'play', MediaPause: 'pause', MediaStop: 'stop',
    ColorF0Red: 'red', ColorF1Green: 'green', ColorF2Yellow: 'yellow', ColorF3Blue: 'blue',
    Info: 'info', Guide: 'guide', ContextMenu: 'menu',
    ClosedCaptionToggle: 'captions', Subtitle: 'captions',
    AudioVolumeMute: 'system-volume', VolumeMute: 'system-volume',
    AudioVolumeUp: 'system-volume', VolumeUp: 'system-volume',
    AudioVolumeDown: 'system-volume', VolumeDown: 'system-volume'
};

const BY_CODE = {
    13: 'ok',
    27: 'escape',
    461: 'back', // LG webOS
    10009: 'back', // Samsung Tizen
    166: 'browser-back',
    8: 'backspace',
    37: 'left', 38: 'up', 39: 'right', 40: 'down',
    33: 'page-up', 34: 'page-down',
    427: 'channel-up', 428: 'channel-down', // Tizen ChannelUp/Down
    176: 'channel-up', 177: 'channel-down', // Media next / previous track
    417: 'channel-up', 412: 'channel-down', // webOS fast-forward / rewind
    228: 'channel-up', 227: 'channel-down', // Fire TV fast-forward / rewind
    179: 'play-pause', 10252: 'play-pause',
    415: 'play', 19: 'pause', 413: 'stop', 178: 'stop',
    403: 'red', 404: 'green', 405: 'yellow', 406: 'blue',
    457: 'info', 458: 'guide'
};

/**
 * Digit 0-9 from the top row, the numpad or a remote's number keys
 * @param {KeyboardEvent} event
 * @returns {number|null}
 */
export function digitOf(event) {
    if (event.key && /^[0-9]$/.test(event.key)) return Number(event.key);
    const code = event.code || '';
    const physical = /^(?:Digit|Numpad)([0-9])$/.exec(code);
    if (physical && !event.shiftKey) return Number(physical[1]);
    const keyCode = event.keyCode || event.which || 0;
    if (!event.key || event.key === 'Unidentified') {
        if (keyCode >= 48 && keyCode <= 57) return keyCode - 48;
        if (keyCode >= 96 && keyCode <= 105) return keyCode - 96;
    }
    return null;
}

/**
 * Latin letter for shortcuts, layout-independent
 * @param {KeyboardEvent} event
 */
function letterOf(event) {
    if (event.key && /^[a-z]$/i.test(event.key)) return event.key.toLowerCase();
    const physical = /^Key([A-Z])$/.exec(event.code || '');
    return physical ? physical[1].toLowerCase() : null;
}

/**
 * Map a keydown event to an action name, or null if the key has no meaning here.
 * Letters come back as 'char:x', digits as 'digit' (read the value with digitOf).
 * @param {KeyboardEvent} event
 * @param {{tv?: boolean}} [context]
 * @returns {string|null}
 */
export function actionOf(event, context) {
    if (event.ctrlKey || event.metaKey || event.altKey) return null;
    if (event.keyCode === 229) return null; // IME composition

    const tv = !!(context && context.tv);
    let action = null;

    if (event.key && Object.prototype.hasOwnProperty.call(BY_KEY, event.key)) {
        action = BY_KEY[event.key];
    } else {
        const code = event.keyCode || event.which || 0;
        if (Object.prototype.hasOwnProperty.call(BY_CODE, code) && (!event.key || event.key === 'Unidentified' || code > 255 || code === 8 || code === 13 || code === 27 || (code >= 33 && code <= 40))) {
            action = BY_CODE[code];
        }
    }

    if (action) {
        // Some remotes send Backspace for Back
        if (action === 'backspace' && tv) return 'back';
        return action;
    }

    if (digitOf(event) !== null) return 'digit';

    // The typed character wins (German/Nordic layouts type '-' on the US '/'
    // key); the physical key is the fallback (Hebrew types '.' there)
    const typed = event.key || '';
    if (typed === '?') return 'help';
    if (typed === '/') return 'search';
    if (typed === ' ') return 'space';
    if (typed === '-') return 'volume-down';
    if (typed === '+' || typed === '=') return 'volume-up';
    if (event.code === 'Slash') return event.shiftKey ? 'help' : 'search';
    if (event.code === 'Space') return 'space';
    if (event.code === 'Minus' || event.code === 'NumpadSubtract') return 'volume-down';
    if (event.code === 'Equal' || event.code === 'NumpadAdd') return 'volume-up';

    const letter = letterOf(event);
    return letter ? 'char:' + letter : null;
}
