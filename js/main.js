// main.js - Application entry point for myTV: boot, wiring and key routing

import { $, isTypingTarget } from './dom.js';
import { state, on, emit, remapSavedKeys, findChannelByNumber, lastChannel } from './store.js';
import { parsePlaylist, buildCategories, readCachedPlaylist, fetchPlaylistText } from './playlist.js';
import { preloadEngine, isActive as playerActive } from './player.js';
import { initLayers, back as layerBack, backFromRemote, backJustHandled } from './layers.js';
import { initModality, move, focusInitial, focusElement, activeScope } from './nav.js';
import { actionOf, digitOf } from './keys.js';
import { applyLayoutClass, isTvMode } from './device.js';
import {
    initBrowse, renderBrowse, showLoading, showError, onBrowseShown, onBrowseHidden,
    focusBrowseStart, focusSearch, toggleFavoriteOnFocused, setPipReturn
} from './ui/browse.js';
import { initWatch, tune, isWatching, isPipDetached, handleWatchKey } from './ui/watch.js';
import { initSheets, initHelp, openHelp, isSheetOpen, showToast, pushDigit } from './ui/overlays.js';
import { initSettings, openSettings, helpTabForDevice } from './ui/settings.js';
import { startClock } from './ui/clock.js';

let lastPlaylistText = null;
let startedOnce = false;
let updatePending = false;

/* ---------- Playlist ---------- */

function applyPlaylist(text) {
    const channels = parsePlaylist(text);
    if (!channels.length) return false;
    state.channels = channels;
    state.categories = buildCategories(channels);
    remapSavedKeys();
    renderBrowse();
    emit('playlist');
    return true;
}

function afterFirstRender() {
    if (startedOnce) return;
    startedOnce = true;
    // A slow first load: the user may already be in Settings or typing a search
    if (isSheetOpen() || isWatching()) return;
    const last = lastChannel();
    if (state.autoplayLast && last) {
        tune(last, state.channels);
        return;
    }
    const active = document.activeElement;
    if (isTvMode() && (!active || active === document.body)) focusBrowseStart();
}

/**
 * Show the cached list at once, then refresh it from the network. A refresh
 * never touches playback.
 * @param {{manual?: boolean}} [options]
 */
function loadPlaylist(options) {
    const manual = !!(options && options.manual);

    if (!lastPlaylistText) {
        const cached = readCachedPlaylist();
        if (cached && applyPlaylist(cached.text)) {
            lastPlaylistText = cached.text;
            afterFirstRender();
        } else {
            showLoading();
        }
    }

    fetchPlaylistText()
        .then((text) => {
            if (text !== lastPlaylistText) {
                lastPlaylistText = text;
                applyPlaylist(text);
            }
            afterFirstRender();
            if (manual) showToast('Channel list is up to date');
        })
        .catch((error) => {
            console.error('[main] Error loading channels:', error);
            if (lastPlaylistText) {
                if (manual) showToast("Couldn't refresh the channel list — showing the saved one");
                return;
            }
            showError("Couldn't load channels", () => {
                showLoading();
                loadPlaylist();
            });
        });
}

/* ---------- Keys ---------- */

function commitNumber(number) {
    const channel = findChannelByNumber(number);
    if (channel) {
        tune(channel, state.channels);
    } else {
        showToast(`There is no channel ${number}`);
    }
}

function handleGlobalKey(action, event) {
    if (action === 'digit') {
        const digit = digitOf(event);
        if (digit === null || !state.channels.length) return false;
        pushDigit(digit, String(state.channels.length).length, commitNumber);
        return true;
    }
    if (action === 'help') {
        openHelp(helpTabForDevice());
        return true;
    }
    return false;
}

function handleSheetKey(action, event) {
    switch (action) {
        case 'up':
        case 'down': {
            const body = $('.sheet-body', activeScope());
            // A focused scroller scrolls natively
            if (body && document.activeElement === body) return false;
            // Nothing further that way: scroll long content (Help) instead
            if (!move(action, event) && body) {
                body.scrollTop += (action === 'down' ? 1 : -1) * Math.round(body.clientHeight * 0.5);
            }
            return true;
        }
        case 'left':
        case 'right':
            move(action, event);
            return true;
        case 'escape':
            layerBack();
            return true;
        case 'back':
            backFromRemote();
            return true;
        default:
            return false;
    }
}

function handleBrowseKey(action, event) {
    switch (action) {
        case 'up':
        case 'down':
        case 'left':
        case 'right':
            move(action, event);
            return true;
        case 'ok':
            if (!document.activeElement || document.activeElement === document.body) {
                focusInitial();
                return true;
            }
            return false;
        case 'escape':
        case 'back': {
            // A late keydown for a Back the browser already handled (it just
            // closed the player): don't also jump the guide
            if (action === 'back' && backJustHandled()) return true;
            // Deep in the guide: first Back returns to the top
            const active = document.activeElement;
            const sections = $('#sections');
            if (window.pageYOffset > 0 || (active && sections.contains(active))) {
                const tab = $('#categoryTabs .tab.is-active') || $('#categoryTabs .tab');
                window.scrollTo(0, 0);
                if (tab) focusElement(tab);
                return true;
            }
            return false;
        }
        case 'search':
            focusSearch();
            return true;
        case 'yellow':
        case 'char:s':
            return toggleFavoriteOnFocused();
        case 'play':
        case 'play-pause': {
            const last = lastChannel();
            if (!last) return false;
            tune(last, state.channels);
            return true;
        }
        default:
            return false;
    }
}

function onKeyDown(event) {
    // The start-up failure screen is up: let OK press its focused Reload button
    const bootFail = document.getElementById('bootFail');
    if (bootFail && !bootFail.hidden) return;
    const action = actionOf(event, { tv: isTvMode() });
    if (!action) return;
    // Text fields handle their own keys (search moves focus on Up/Down itself)
    if (isTypingTarget(event.target)) return;
    // A held OK auto-repeats: only the first press acts (otherwise it chains
    // card -> player -> channel list -> re-tune ...)
    if (event.repeat && action === 'ok') {
        event.preventDefault();
        return;
    }

    let handled;
    if (isSheetOpen()) {
        handled = handleSheetKey(action, event);
    } else if (isWatching()) {
        handled = handleWatchKey(action, event) || handleGlobalKey(action, event);
    } else {
        handled = handleBrowseKey(action, event) || handleGlobalKey(action, event);
    }
    if (handled) event.preventDefault();
}

/* ---------- Service worker ---------- */

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
        .then((registration) => {
            const check = () => registration.update().catch(() => {});
            check();
            // TVs stay open for days: look for new versions now and then
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) check();
            });
            setInterval(check, 6 * 60 * 60 * 1000);
        })
        .catch(() => {});

    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || reloading) return;
        // Never interrupt playback (including picture-in-picture over the
        // guide); reload once it has stopped
        if (isWatching() || playerActive() || isPipDetached()) {
            updatePending = true;
            return;
        }
        reloading = true;
        window.location.reload();
    });
}

function reloadIfUpdatePending() {
    if (updatePending && !isWatching() && !playerActive() && !isPipDetached()) {
        window.location.reload();
        return true;
    }
    return false;
}

/* ---------- Boot ---------- */

/**
 * TVs have no devtools: if start-up throws, say so on screen (index.html's
 * #bootFail); if it worked, make sure a late watchdog isn't covering the app
 */
function boot() {
    clearTimeout(window.__tvBoot);
    const box = document.getElementById('bootFail');
    // The watchdog fired early on a slow TV, but we did load: take it down
    // before start() decides where focus goes
    if (box && !box.hidden) {
        box.hidden = true;
        if (box.contains(document.activeElement)) document.activeElement.blur();
    }
    try {
        start();
    } catch (error) {
        const detail = document.getElementById('bootFailDetail');
        if (detail) detail.textContent = String((error && error.message) || error);
        if (box) {
            box.hidden = false;
            const reload = document.getElementById('bootFailReload');
            if (reload) reload.focus();
        }
        throw error;
    }
}

function start() {
    applyLayoutClass();
    initModality();
    initLayers({
        guard: isTvMode(),
        onExitAttempt: () => showToast('Press Back again to exit')
    });
    initSheets();
    initHelp();
    initSettings();
    initBrowse();
    initWatch();
    startClock([$('#browseClock'), $('#watchClock')]);

    on('tune', (payload) => tune(payload.channel, payload.list));
    on('watch:opened', onBrowseHidden);
    on('watch:closed', () => {
        if (reloadIfUpdatePending()) return;
        onBrowseShown();
    });
    on('player:stopped', reloadIfUpdatePending);
    on('player:error', reloadIfUpdatePending);
    on('pip:detached', (channel) => setPipReturn(channel || null));
    on('playlist:refresh', (payload) => loadPlaylist(payload));
    on('layout', () => {
        applyLayoutClass();
        renderBrowse();
    });

    $('#settingsButton').addEventListener('click', openSettings);
    document.addEventListener('keydown', onKeyDown);

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(applyLayoutClass, 150);
    });

    loadPlaylist();
    registerServiceWorker();
    // Warm up the HLS engine while the user picks a channel
    setTimeout(preloadEngine, 1500);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
    boot();
}
