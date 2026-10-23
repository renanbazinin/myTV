// config.js - Static configuration for myTV

export const APP_NAME = 'RENAN TV';

export const M3U_URL = 'https://raw.githubusercontent.com/renanbazinin/myM3U/main/directLiveNamesDiffandEPG1.m3u';

export const HLS_JS_URL = 'https://cdn.jsdelivr.net/npm/hls.js@1.6.13/dist/hls.min.js';

export const SUPPORT_URL = 'https://www.buymeacoffee.com/renanbazinin';

// localStorage keys. Volume / mute keys are kept from the previous version so
// existing users keep their settings.
export const STORAGE_KEYS = {
    volume: 'myTV_volume',
    muted: 'myTV_isMuted',
    favorites: 'myTV_favorites_v1',
    lastChannel: 'myTV_lastChannel_v1',
    layout: 'myTV_layout_v1',
    autoplayLast: 'myTV_autoplayLast_v1',
    reverseZap: 'myTV_reverseZap_v1',
    category: 'myTV_category_v1',
    playlistCache: 'myTV_m3u_cache_v2'
};

// Player chrome auto-hide delay (TV remotes get longer)
export const CHROME_IDLE_MS = 3500;
export const CHROME_IDLE_TV_MS = 5000;

// Give up tuning a channel after this long without a playable stream
export const TUNE_TIMEOUT_MS = 20000;

// Rapid prev/next presses only move the banner; the stream starts once they stop
export const ZAP_SETTLE_MS = 450;

// Numeric channel entry: commit after this pause between digits
export const NUMBER_ENTRY_MS = 1500;

export const DEFAULT_VOLUME = 0.6;

// How each logo sits on its 16:9 plate:
//   light (default) - dark ink on a light plate
//   dark            - light ink on a dark plate
//   fill            - opaque artwork filling the plate, edges in `bg`
//   cover           - photo-like artwork cropped to the plate
// Matched against the logo URL; add entries when new channels need them.
export const LOGO_STYLES = [
    { match: 'Knessetch10', mode: 'dark' },
    { match: 'panomax', mode: 'dark' },
    { match: 'br.de/mediathek', mode: 'fill', bg: '#003347' },
    { match: 'viewsurf.com', mode: 'fill', bg: '#444444' },
    { match: 'LiveNOW_from_FOX', mode: 'fill', bg: '#ffffff' },
    { match: 'Logo-Schl-Dachstein', mode: 'fill', bg: '#ffffff' },
    { match: 'adultswim.com', mode: 'cover' },
    { match: 'static.thcdn.com', mode: 'cover' }
];
