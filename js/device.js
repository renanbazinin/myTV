// device.js - Device / layout detection and fullscreen, PiP and orientation helpers

import { state } from './store.js';

// Keep in sync with the inline script in index.html (runs before first paint)
const TV_UA_PATTERN = /smart-?tv|smarttv|tizen|web0s|webos|netcast|bravia|hbbtv|viera|philipstv|nettv|android tv|googletv|google tv|crkey|roku|vidaa|titan|tv bro/i;
const FIRE_TV_PATTERN = /\bAFT[A-Z0-9]{1,6}\b/;

/**
 * Whether the browser looks like a TV: known TV user agents, or a primary
 * input with no pointer at all (D-pad only Android TV)
 */
export function looksLikeTv() {
    const ua = navigator.userAgent || '';
    if (TV_UA_PATTERN.test(ua) || FIRE_TV_PATTERN.test(ua)) return true;
    return window.matchMedia('(pointer: none)').matches && window.matchMedia('(min-width: 900px)').matches;
}

/**
 * Resolve the layout to use: URL override, explicit setting, otherwise detect.
 * A portrait / narrow screen never gets the TV layout.
 * @returns {boolean} whether TV mode is on
 */
export function isTvMode() {
    if (window.innerWidth < window.innerHeight * 1.3) return false;
    const override = /[?&]tv=(1|0|true|false|on|off)\b/i.exec(window.location.search);
    if (override) return /^(1|true|on)$/i.test(override[1]);
    if (state.layout === 'tv') return true;
    if (state.layout === 'standard') return false;
    return looksLikeTv();
}

/**
 * Apply / remove the TV layout class
 */
export function applyLayoutClass() {
    document.documentElement.classList.toggle('tv', isTvMode());
}

export function isCoarsePointer() {
    return window.matchMedia('(pointer: coarse)').matches;
}

export function canHover() {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/**
 * Installed to the home screen / as an app
 */
export function isStandalone() {
    return navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

/**
 * Listen to a media query (Safari < 14 only has addListener)
 * @param {string} query
 * @param {Function} fn
 */
export function onMediaChange(query, fn) {
    const mql = window.matchMedia(query);
    if (typeof mql.addListener === 'function') {
        mql.addListener(fn);
    } else if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', fn);
    }
    return mql;
}

/* ---------- Fullscreen ---------- */

export function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

export function fullscreenSupported() {
    const el = document.documentElement;
    const enabled = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    return !!((el.requestFullscreen || el.webkitRequestFullscreen) && enabled !== false);
}

/**
 * Whether we can show video fullscreen at all (Element API or iPhone's native player)
 * @param {HTMLVideoElement|null} video
 */
export function canFullscreen(video) {
    return fullscreenSupported() || !!(video && typeof video.webkitEnterFullscreen === 'function');
}

function lockLandscape() {
    try {
        if (screen.orientation && typeof screen.orientation.lock === 'function' && isCoarsePointer()) {
            screen.orientation.lock('landscape').catch(() => {});
        }
    } catch (_error) {
        // Not supported
    }
}

/**
 * Enter / leave fullscreen. Must run inside a click / key handler. The
 * container (not the <video>) goes fullscreen so our controls stay visible;
 * iPhone has no Element fullscreen and falls back to the native player.
 * @param {HTMLElement} container
 * @param {HTMLVideoElement|null} video
 */
export function toggleFullscreen(container, video) {
    if (fullscreenElement()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) {
            const result = exit.call(document);
            if (result && typeof result.catch === 'function') result.catch(() => {});
        }
        return;
    }

    if (fullscreenSupported()) {
        const request = container.requestFullscreen || container.webkitRequestFullscreen;
        let result;
        try {
            result = request.call(container, { navigationUI: 'hide' });
        } catch (_error) {
            result = null;
        }
        if (result && typeof result.then === 'function') {
            result.then(lockLandscape).catch(() => {});
        } else {
            lockLandscape();
        }
        return;
    }

    if (video && typeof video.webkitEnterFullscreen === 'function' && video.webkitSupportsFullscreen !== false) {
        try {
            video.webkitEnterFullscreen();
        } catch (_error) {
            // Not ready yet (no metadata)
        }
    }
}

/* ---------- Picture-in-Picture ---------- */

export function pipSupported(video) {
    if (!video) return false;
    if (document.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function') return true;
    return typeof video.webkitSupportsPresentationMode === 'function'
        && video.webkitSupportsPresentationMode('picture-in-picture');
}

/**
 * Must run inside a click / key handler
 * @param {HTMLVideoElement} video
 */
export function togglePip(video) {
    if (!video) return;
    try {
        if (document.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function') {
            if (document.pictureInPictureElement) {
                document.exitPictureInPicture().catch(() => {});
            } else {
                video.requestPictureInPicture().catch(() => {});
            }
            return;
        }
        if (typeof video.webkitSetPresentationMode === 'function') {
            const inPip = video.webkitPresentationMode === 'picture-in-picture';
            video.webkitSetPresentationMode(inPip ? 'inline' : 'picture-in-picture');
        }
    } catch (_error) {
        // NotSupportedError in some iOS home-screen apps
    }
}
