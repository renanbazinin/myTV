// watch.js - Player screen: HUD controls, channel list, gestures, remote keys
//
// Remote model: when focus sits on the video surface (#stage), Up/Down change
// channel, OK opens the channel list and Left/Right reveal the controls. Once
// a control has focus, arrows move between controls; leaving the bar's edge
// returns to the surface. The controls hide after a few idle seconds and
// focus goes back to the surface, so OK never presses an invisible button.

import { h, icon, setIcon, $, $$, isVisible } from '../dom.js';
import { state, emit, on, isFavorite, toggleFavorite, setLastChannel, findChannelByKey } from '../store.js';
import * as player from '../player.js';
import { captionTracks, selectedCaptionTrack, cycleCaptions } from '../captions.js';
import { resolveStreamUrl, needsResolver, toAvcUrl } from '../streams.js';
import { openLayer, closeLayer, isOpen, back as layerBack, backFromRemote } from '../layers.js';
import { pushScope, popScope, move, focusElement, focusQuietly, isKeyboardMode } from '../nav.js';
import { isTvMode, onMediaChange, toggleFullscreen, fullscreenElement, canFullscreen, pipSupported, togglePip, isStandalone } from '../device.js';
import { channelLogo } from './logo.js';
import { showToast, announce, isSheetOpen } from './overlays.js';
import { CHROME_IDLE_MS, CHROME_IDLE_TV_MS, ZAP_SETTLE_MS } from '../config.js';

const DOCKED_QUERY = '(max-width: 767px) and (orientation: portrait)';

let els = {};
let watching = false;
let detachedInPip = false;
let pipActive = false;
let tuneToken = 0;
let hudTimer = null;
let hudHover = false;
let sliderDragging = false;
let errorShown = false;
let tuning = false;
let dockedMql = null;
let lastControl = null;
let airplayAvailable = false;
let savedScrollY = 0;
let guideIdleTimer = null;
let guideOpener = null;
let lastTouchAt = 0;
let lastUrl = null;
let avcRetried = false;
let resolveTimer = null;
// The current stream was refused autoplay (or paused) before its first frame
let startBlocked = false;

// Resolving a special channel's URL (network lookup) gives up after this long
const RESOLVE_TIMEOUT_MS = 15000;

// Zap debounce
let zapTimer = null;
let zapTarget = null;
let lastZapAt = 0;

/* ---------- Layout helpers ---------- */

function isDocked() {
    return !isTvMode() && !!dockedMql && dockedMql.matches;
}

function guideOverlayOpen() {
    return els.guide.classList.contains('is-open');
}

function onSurface() {
    const active = document.activeElement;
    return !active || active === els.stage || active === document.body || !els.watch.contains(active);
}

/** A control (not the surface) has keyboard focus */
function inControlMode() {
    const active = document.activeElement;
    return isKeyboardMode() && !onSurface() && els.stage.contains(active) && active.hasAttribute('data-nav');
}

function focusSurface() {
    focusQuietly(els.stage);
}

/* ---------- HUD visibility ---------- */

function idleDelay() {
    return isTvMode() || inControlMode() ? CHROME_IDLE_TV_MS : CHROME_IDLE_MS;
}

/** Mouse events that follow a tap are synthetic; ignore them for hover */
function fromTouch() {
    return Date.now() - lastTouchAt < 800;
}

/** On PC, keep the controls up while a keyboard user is on them */
function controlsHaveFocus() {
    if (isTvMode()) return false;
    const active = document.activeElement;
    return $$('.hud', els.stage).some((hud) => hud.contains(active));
}

function canAutoHide() {
    return watching && !tuning && !errorShown && !player.isPaused() && !guideOverlayOpen()
        && !(hudHover && !isKeyboardMode()) && !sliderDragging && !isSheetOpen()
        && els.unmutePill.hidden && !controlsHaveFocus();
}

function showHud() {
    els.watch.classList.remove('is-idle');
    clearTimeout(hudTimer);
    hudTimer = setTimeout(hideHud, idleDelay());
}

function hideHud(force) {
    clearTimeout(hudTimer);
    if (!force && !canAutoHide()) {
        hudTimer = setTimeout(hideHud, idleDelay());
        return;
    }
    if (!onSurface() && els.stage.contains(document.activeElement)) {
        focusSurface();
    }
    els.watch.classList.add('is-idle');
}

function hudVisible() {
    return !els.watch.classList.contains('is-idle');
}

/* ---------- Now-playing info ---------- */

function renderNowPlaying(channel) {
    els.nowNumber.textContent = String(channel.number);
    els.nowName.textContent = channel.name;
    els.nowGroup.textContent = channel.groupLabel;
    els.dockNumber.textContent = String(channel.number);
    els.dockName.textContent = channel.name;
    els.dockGroup.textContent = channel.groupLabel;

    [els.nowLogo, els.dockLogo, els.tuningLogo].forEach((host) => {
        host.textContent = '';
        host.appendChild(channelLogo(channel));
    });
    els.tuningName.textContent = channel.name;
    renderFavorite();
}

function renderFavorite() {
    const favorite = isFavorite(state.current);
    [els.favButton, els.dockFavButton].forEach((button) => {
        button.setAttribute('aria-pressed', favorite ? 'true' : 'false');
        setIcon(button, favorite ? 'star' : 'star-outline');
    });
}

function renderPlayState() {
    const paused = player.isPaused() && !tuning && !errorShown;
    els.playButton.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    setIcon(els.playButton, paused ? 'play' : 'pause');
    els.bigPlay.hidden = !(paused && watching && player.isActive());
    if ('mediaSession' in navigator) {
        try {
            navigator.mediaSession.playbackState = paused ? 'paused' : 'playing';
        } catch (_error) { /* unsupported */ }
    }
}

/**
 * Sync every volume control with the player
 */
export function renderVolume() {
    const muted = player.isMuted();
    const value = muted ? 0 : Math.round(state.volume * 100);
    [els.muteButton, $('#settingsMute')].forEach((button) => {
        if (!button) return;
        button.setAttribute('aria-pressed', muted ? 'true' : 'false');
        setIcon(button, muted ? 'volume-off' : 'volume');
    });
    [els.volumeSlider, $('#settingsVolume')].forEach((slider) => {
        if (!slider) return;
        // While dragging this writes back the value the slider already has
        slider.value = String(value);
        slider.style.setProperty('--fill', value + '%');
        slider.setAttribute('aria-valuetext', muted ? 'Muted' : value + '%');
    });
    if (!player.isForcedMute()) els.unmutePill.hidden = true;
}

function renderCapabilities() {
    const video = player.getVideo();
    const tv = isTvMode();
    els.pipButton.hidden = tv || !pipSupported(video) || isStandalone();
    els.airplayButton.hidden = tv || !player.airplaySupported() || !airplayAvailable;
    els.fullscreenButton.hidden = tv || !canFullscreen(video);
    els.watch.classList.toggle('no-volume', tv || !player.volumeWritable());
    const full = !!fullscreenElement();
    els.fullscreenButton.setAttribute('aria-label', full ? 'Exit full screen' : 'Full screen');
    setIcon(els.fullscreenButton, full ? 'fullscreen-exit' : 'fullscreen');
    els.watch.classList.toggle('is-fullscreen', full);
}

/** The CC button shows only while the stream has captions */
function renderCaptionsButton() {
    const tracks = captionTracks();
    const current = selectedCaptionTrack();
    els.ccButton.hidden = !tracks.length;
    els.ccButton.setAttribute('aria-pressed', current ? 'true' : 'false');
    els.ccButton.setAttribute('aria-label', current && tracks.length > 1 ? `Captions: ${current.label}` : 'Captions');
    setIcon(els.ccButton, current ? 'cc' : 'cc-off');
}

function renderCaptionText(payload) {
    const text = (payload && payload.text) || '';
    els.captionsText.textContent = text;
    els.captions.hidden = !text;
    els.captions.classList.toggle('is-top', !!(payload && payload.top));
}

function renderLive() {
    const behind = player.isBehindLive();
    els.liveButton.classList.toggle('is-behind', behind);
    els.liveButtonText.textContent = behind ? 'Go live' : 'Live';
    els.liveButton.setAttribute('aria-label', behind ? 'Behind live. Jump to live' : 'Live');
}

/* ---------- Media Session (lock screen, headsets, PiP window) ---------- */

function updateMediaSession(channel) {
    if (!('mediaSession' in navigator) || typeof window.MediaMetadata !== 'function') return;
    try {
        navigator.mediaSession.metadata = new window.MediaMetadata({
            title: channel.name,
            artist: `Live · Channel ${channel.number} · ${channel.groupLabel}`,
            album: 'RENAN TV',
            artwork: channel.logo ? [{ src: channel.logo, sizes: '512x512' }] : []
        });
    } catch (_error) { /* unsupported */ }
}

function initMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const handlers = {
        play: () => { if (player.isPaused()) player.togglePlay(); },
        pause: () => { if (!player.isPaused()) player.togglePlay(); },
        nexttrack: () => zap(1),
        previoustrack: () => zap(-1),
        stop: () => exitWatch(),
        seekbackward: null,
        seekforward: null,
        seekto: null
    };
    Object.keys(handlers).forEach((action) => {
        try {
            navigator.mediaSession.setActionHandler(action, handlers[action]);
        } catch (_error) { /* action not supported */ }
    });
}

/* ---------- Tuning ---------- */

function setTuning(active) {
    tuning = active;
    els.tuning.hidden = !active;
    // The tuning screen covers the spinner; a cancelled zap brings it back
    els.buffering.hidden = active || errorShown || !player.isBuffering();
    if (active) showHud();
    renderPlayState();
}

function showStageError(message) {
    errorShown = true;
    setTuning(false);
    els.buffering.hidden = true;
    const channel = state.current;
    els.errorTitle.textContent = channel ? `Can't play ${channel.name}` : 'Playback failed';
    els.errorText.textContent = message || 'Something went wrong.';
    els.errorNext.hidden = state.channels.length < 2;
    els.stageError.hidden = false;
    els.watch.classList.add('has-error');
    renderPlayState();
    showHud();
    if (isKeyboardMode() || isTvMode()) {
        focusElement(els.retryButton);
    }
    announce(els.errorTitle.textContent + '. ' + els.errorText.textContent, 0);
}

function hideStageError() {
    errorShown = false;
    els.stageError.hidden = true;
    els.watch.classList.remove('has-error');
    if (els.stageError.contains(document.activeElement)) focusSurface();
}

/**
 * Start watching a channel. Call synchronously from the user's tap/key where
 * possible: it primes the video element so sound is allowed.
 * @param {Object} channel
 * @param {Array} [list] - the list it was picked from; prev/next stay inside it
 */
export function tune(channel, list) {
    if (!channel) return;

    // Picking what is already playing (or loading) must not restart it
    if (state.current && channel.key === state.current.key && player.isActive() && !errorShown && !zapTimer) {
        if (detachedInPip) {
            returnFromPip();
            return;
        }
        if (watching) {
            // Resume a pause, or start a stream whose autoplay was refused
            if (player.isPaused() && (player.hasStarted() || startBlocked)) player.togglePlay();
            setTuning(player.isActive() && !player.hasStarted() && !startBlocked);
            showHud();
            return;
        }
    }

    clearTimeout(zapTimer);
    zapTimer = null;
    zapTarget = null;
    player.prime();
    const token = ++tuneToken;

    if (state.current && state.current.key !== channel.key) {
        state.previous = state.current;
    }
    state.current = channel;
    if (list && list.some((item) => item.key === channel.key)) {
        state.zapList = list.slice();
    } else if (!state.zapList.some((item) => item.key === channel.key)) {
        state.zapList = state.channels.slice();
    }
    setLastChannel(channel);

    if (detachedInPip) {
        detachedInPip = false;
        emit('pip:detached', null);
    }
    enterWatch();
    hideStageError();
    // A forced (autoplay) mute survives channel changes, and so must its prompt
    els.unmutePill.hidden = !player.isForcedMute();
    renderNowPlaying(channel);
    renderGuideCurrent(true);
    updateMediaSession(channel);
    setTuning(true);
    document.title = `${channel.name} · RENAN TV`;
    announce(`Channel ${channel.number}, ${channel.name}`);
    emit('channel', channel);
    startStream(channel, token);
}

/**
 * Resolve the channel's URL (with a timeout for network lookups) and play it
 * @param {Object} channel
 * @param {number} token
 */
function startStream(channel, token) {
    lastUrl = null;
    avcRetried = false;
    startBlocked = false;
    // Special channels look their URL up over the network: don't leave the
    // previous channel playing under the new banner meanwhile (in
    // picture-in-picture it keeps playing until the new stream replaces it)
    if (needsResolver(channel) && player.isActive() && watching) {
        player.stop();
        // stop() lifts a forced mute without an event
        els.unmutePill.hidden = !player.isForcedMute();
    }

    clearTimeout(resolveTimer);
    new Promise((resolve, reject) => {
        resolveTimer = setTimeout(() => reject(new Error(`Couldn't get a stream for ${channel.name}`)), RESOLVE_TIMEOUT_MS);
        resolveStreamUrl(channel).then(resolve, reject);
    })
        .then((url) => {
            clearTimeout(resolveTimer);
            if (token !== tuneToken || !(watching || detachedInPip)) return null;
            lastUrl = url;
            return player.play(url);
        })
        .then(() => {
            if (token !== tuneToken) return;
            renderCapabilities();
        })
        .catch((error) => {
            clearTimeout(resolveTimer);
            if (token !== tuneToken) return;
            if (!watching) {
                // Resolver failed while playing in PiP over the guide
                if (detachedInPip) {
                    detachedInPip = false;
                    emit('pip:detached', null);
                    if (player.isActive()) player.stop();
                }
                return;
            }
            // player.play() reports its own failures through player:error
            if (!errorShown) {
                if (player.isActive()) player.stop();
                showStageError(error && error.message);
            }
        });
}

/**
 * Drop a pending (debounced) zap and go back to showing the current channel
 */
function cancelPendingZap() {
    clearTimeout(zapTimer);
    zapTimer = null;
    zapTarget = null;
    if (state.current) renderNowPlaying(state.current);
    setTuning(player.isActive() && !player.hasStarted() && !startBlocked);
}

/**
 * Change channel while the video plays in picture-in-picture over the guide:
 * keep the guide on screen
 * @param {Object} channel
 * @param {Array} list
 */
function tuneDetached(channel, list) {
    const token = ++tuneToken;
    if (state.current) state.previous = state.current;
    state.current = channel;
    state.zapList = list.slice();
    setLastChannel(channel);
    updateMediaSession(channel);
    emit('pip:detached', channel);
    emit('channel', channel);
    startStream(channel, token);
}

/**
 * Next / previous channel within the current list. Rapid presses only move
 * the banner; the stream starts once they settle.
 * @param {number} offset - +1 = next (higher number)
 */
export function zap(offset) {
    // A one-channel list (News, a single favorite) zaps through everything
    const list = state.zapList.length > 1 ? state.zapList : state.channels;
    if (!list.length) return;
    const base = zapTarget || state.current;
    let index = -1;
    list.forEach((item, i) => {
        if (base && item.key === base.key) index = i;
    });
    const next = list[((index + offset) % list.length + list.length) % list.length];
    if (!next || (base && next.key === base.key)) {
        showHud();
        return;
    }

    if (!watching) {
        if (detachedInPip) {
            tuneDetached(next, list);
        } else {
            tune(next, list);
        }
        return;
    }

    const now = Date.now();
    const rapid = now - lastZapAt < ZAP_SETTLE_MS || !!zapTimer;
    lastZapAt = now;

    if (!rapid) {
        tune(next, list);
        return;
    }

    zapTarget = next;
    renderNowPlaying(next);
    setTuning(true);
    showHud();
    clearTimeout(zapTimer);
    zapTimer = setTimeout(() => {
        zapTimer = null;
        const target = zapTarget;
        zapTarget = null;
        if (target && watching) tune(target, list);
    }, ZAP_SETTLE_MS);
}

/**
 * Arrow-key zap honouring the "reverse up/down" setting
 * @param {'up'|'down'} dir
 */
function zapArrow(dir) {
    const offset = dir === 'up' ? 1 : -1;
    zap(state.reverseZap ? -offset : offset);
}

export function recallPrevious() {
    if (state.previous) {
        tune(findChannelByKey(state.previous.key) || state.previous);
    }
}

export function retry() {
    if (state.current) tune(state.current, state.zapList);
}

/* ---------- View open / close ---------- */

function lockScroll() {
    savedScrollY = window.pageYOffset;
    const style = document.body.style;
    style.position = 'fixed';
    style.top = (-savedScrollY) + 'px';
    style.left = '0';
    style.right = '0';
    style.width = '100%';
}

function unlockScroll() {
    const style = document.body.style;
    style.position = '';
    style.top = '';
    style.left = '';
    style.right = '';
    style.width = '';
    window.scrollTo(0, savedScrollY);
}

function enterWatch() {
    if (watching) return;
    watching = true;
    lockScroll();
    els.watch.hidden = false;
    document.documentElement.classList.add('watch-open');
    pushScope(els.watch);
    openLayer('watch', hideWatch);
    emit('watch:opened');
    focusSurface();
    renderCapabilities();
}

function hideWatch() {
    watching = false;
    tuneToken += 1;
    clearTimeout(zapTimer);
    zapTimer = null;
    zapTarget = null;

    if (pipActive && player.isActive()) {
        // Keep playing in the picture-in-picture window while browsing
        detachedInPip = true;
        emit('pip:detached', state.current);
    } else {
        player.stop();
    }

    hideGuide();
    hideStageError();
    setTuning(false);
    clearTimeout(hudTimer);
    hudHover = false;
    if (fullscreenElement()) {
        toggleFullscreen(els.watch, null);
    }
    els.watch.hidden = true;
    els.watch.classList.remove('is-idle');
    document.documentElement.classList.remove('watch-open');
    popScope(els.watch);
    unlockScroll();
    document.title = 'RENAN TV';
    if (!detachedInPip && 'mediaSession' in navigator) {
        try { navigator.mediaSession.playbackState = 'none'; } catch (_error) { /* unsupported */ }
    }
    emit('watch:closed');
}

/**
 * Leave the player and go back to the guide
 */
export function exitWatch() {
    if (!closeLayer('watch')) hideWatch();
}

/**
 * Back to the player from the picture-in-picture pill (or the PiP window's
 * "back to tab" button)
 */
export function returnFromPip() {
    if (!detachedInPip || !state.current) return;
    detachedInPip = false;
    emit('pip:detached', null);
    if (document.pictureInPictureElement && document.exitPictureInPicture) {
        document.exitPictureInPicture().catch(() => {});
    }
    enterWatch();
    renderNowPlaying(state.current);
    renderGuideCurrent(true);
    renderPlayState();
    showHud();
}

export function isWatching() {
    return watching;
}

/** Playing in picture-in-picture while the guide is shown */
export function isPipDetached() {
    return detachedInPip;
}

/* ---------- Channel list (guide) ---------- */

function guideRowLabel(channel) {
    return `${channel.number}, ${channel.name}${isFavorite(channel) ? ', favorite' : ''}`;
}

function onGuideRowClick(channel) {
    const same = state.current && state.current.key === channel.key && !errorShown;
    if (same && zapTimer) {
        cancelPendingZap();
    } else {
        tune(channel, state.channels);
    }
    if (guideOverlayOpen() && (isTvMode() || !window.matchMedia('(hover: hover) and (pointer: fine)').matches)) {
        closeGuide();
    } else if (!isKeyboardMode()) {
        // A mouse click must not leave Space / Enter on the row (they'd re-pick it)
        focusSurface();
    }
}

function renderGuide() {
    // Keep focus and scroll when the list is rebuilt (playlist refresh)
    const focusedKey = els.guide.contains(document.activeElement) ? document.activeElement.getAttribute('data-key') : null;
    const scrollTop = els.guideList.scrollTop;

    els.guideList.textContent = '';
    const fragment = document.createDocumentFragment();
    let lastGroup = null;
    state.channels.forEach((channel) => {
        if (channel.group !== lastGroup) {
            lastGroup = channel.group;
            fragment.appendChild(h('li.guide-group', { role: 'presentation' }, [h('span', { text: channel.groupLabel })]));
        }
        const row = h('button.guide-row', {
            type: 'button',
            'data-nav': true,
            'data-key': channel.key,
            'aria-label': guideRowLabel(channel),
            onclick: () => onGuideRowClick(channel)
        }, [
            h('span.guide-row-number', { text: String(channel.number) }),
            h('span.guide-row-logo', null, [channelLogo(channel)]),
            h('span.guide-row-text', null, [
                h('span.guide-row-name', { text: channel.name }),
                h('span.guide-row-group', { text: channel.groupLabel })
            ]),
            isFavorite(channel) ? icon('star', 'guide-row-star') : null,
            h('span.guide-row-eq', { 'aria-hidden': 'true' }, [h('i'), h('i'), h('i')])
        ]);
        fragment.appendChild(h('li.guide-item', null, [row]));
    });
    els.guideList.appendChild(fragment);
    els.guideList.scrollTop = scrollTop;
    renderGuideCurrent(false);

    if (focusedKey) {
        const again = guideRows().filter((row) => row.getAttribute('data-key') === focusedKey)[0];
        if (again) focusQuietly(again);
    }
}

/**
 * Favorites changed: update stars in place (keeps focus and scroll)
 */
function updateGuideStars() {
    guideRows().forEach((row) => {
        const channel = findChannelByKey(row.getAttribute('data-key'));
        if (!channel) return;
        const favorite = isFavorite(channel);
        const star = row.querySelector('.guide-row-star');
        if (favorite && !star) {
            row.insertBefore(icon('star', 'guide-row-star'), row.querySelector('.guide-row-eq'));
        } else if (!favorite && star) {
            row.removeChild(star);
        }
        row.setAttribute('aria-label', guideRowLabel(channel));
    });
}

function guideRows() {
    return $$('.guide-row', els.guideList);
}

function currentGuideRow() {
    if (!state.current) return null;
    return guideRows().filter((row) => row.getAttribute('data-key') === state.current.key)[0] || null;
}

function renderGuideCurrent(scroll) {
    guideRows().forEach((row) => {
        const current = !!state.current && row.getAttribute('data-key') === state.current.key;
        row.classList.toggle('is-current', current);
        if (current) {
            row.setAttribute('aria-current', 'true');
        } else {
            row.removeAttribute('aria-current');
        }
    });
    if (scroll) {
        const row = currentGuideRow();
        if (row && isVisible(row)) {
            const list = els.guideList;
            list.scrollTop = Math.max(0, row.offsetTop - (list.clientHeight - row.offsetHeight) / 2);
        }
    }
}

function bumpGuideIdle() {
    clearTimeout(guideIdleTimer);
    if (!isTvMode()) return;
    guideIdleTimer = setTimeout(() => {
        if (guideOverlayOpen()) closeGuide();
    }, 10000);
}

function openGuide() {
    if (isDocked()) {
        const row = currentGuideRow();
        if (row) focusElement(row);
        return;
    }
    if (guideOverlayOpen()) return;
    // Focus goes back to whatever opened the list: the Channels button, or the
    // video surface (so Up/Down zap again right away)
    guideOpener = onSurface() ? null : document.activeElement;
    els.guide.classList.add('is-open');
    els.guideButton.setAttribute('aria-expanded', 'true');
    pushScope(els.guide);
    openLayer('guide', hideGuide);
    renderGuideCurrent(true);
    showHud();
    bumpGuideIdle();
    const row = currentGuideRow();
    if (row && (isKeyboardMode() || isTvMode())) {
        focusElement(row);
    }
}

function hideGuide() {
    clearTimeout(guideIdleTimer);
    if (!guideOverlayOpen()) return;
    els.guide.classList.remove('is-open');
    els.guideButton.setAttribute('aria-expanded', 'false');
    popScope(els.guide);
    if (els.guide.contains(document.activeElement) || document.activeElement === document.body) {
        if (guideOpener && els.stage.contains(guideOpener) && isVisible(guideOpener)
            && isKeyboardMode() && hudVisible() && watching) {
            focusElement(guideOpener);
        } else {
            focusSurface();
        }
    }
    guideOpener = null;
    showHud();
}

function closeGuide() {
    if (!closeLayer('guide')) hideGuide();
}

function toggleGuide() {
    if (guideOverlayOpen()) {
        closeGuide();
    } else {
        openGuide();
    }
}

/**
 * Up/Down inside the channel list, wrapping at the ends
 * @param {string} dir
 * @param {KeyboardEvent} event
 */
function moveInGuide(dir, event) {
    bumpGuideIdle();
    if (move(dir, event)) return;
    if (dir !== 'up' && dir !== 'down') return;
    const rows = guideRows();
    if (!rows.length) return;
    focusElement(dir === 'down' ? rows[0] : rows[rows.length - 1]);
}

function pageGuide(steps) {
    bumpGuideIdle();
    const rows = guideRows();
    const index = rows.indexOf(document.activeElement);
    const next = rows[Math.max(0, Math.min(rows.length - 1, (index === -1 ? 0 : index) + steps))];
    if (next) focusElement(next);
}

/* ---------- Actions ---------- */

function toggleFavoriteCurrent() {
    if (!state.current) return;
    const active = toggleFavorite(state.current);
    showToast(active ? `★ Added ${state.current.name} to favorites` : `Removed ${state.current.name} from favorites`);
}

function doFullscreen() {
    // The whole player goes fullscreen (never just the video), so the channel
    // list and overlays stay inside it in every orientation
    toggleFullscreen(els.watch, player.getVideo());
}

function unmuteFromGesture() {
    player.setMuted(false);
    els.unmutePill.hidden = true;
    showHud();
}

/**
 * Captions off -> on (-> the next language, when there are several) -> off
 */
function toggleCaptions() {
    const count = captionTracks().length;
    if (!count) {
        showToast('No captions on this channel', 2000);
        return;
    }
    const track = cycleCaptions();
    if (!track) {
        showToast('Captions off', 1500);
    } else {
        showToast(count > 1 ? `Captions: ${track.label}` : 'Captions on', 1500);
    }
}

function nudgeVolume(delta) {
    if (isTvMode()) return;
    player.nudgeVolume(delta);
    showToast(player.isMuted() ? 'Muted' : `Volume ${Math.round(state.volume * 100)}%`, 1200);
}

/* ---------- Keys ---------- */

/**
 * Handle a normalised key while the player is open
 * @param {string} action - from keys.js
 * @param {KeyboardEvent} event
 * @returns {boolean} handled (caller prevents the default action)
 */
export function handleWatchKey(action, event) {
    if (!watching) return false;
    const guideActive = guideOverlayOpen() || (isDocked() && els.guide.contains(document.activeElement));
    const controlMode = inControlMode() || (errorShown && els.stageError.contains(document.activeElement));

    switch (action) {
        case 'up':
        case 'down':
            if (guideActive) {
                moveInGuide(action, event);
                return true;
            }
            if (controlMode) {
                showHud();
                if (!move(action, event)) {
                    // Off the edge of the controls: back to the video surface.
                    // On the error card (one row of buttons) Up/Down zap away.
                    focusSurface();
                    if (errorShown) {
                        zapArrow(action);
                    } else {
                        hideHud(true);
                    }
                }
                return true;
            }
            zapArrow(action);
            return true;
        case 'left':
        case 'right':
            if (guideActive) {
                if (action === 'right' && guideOverlayOpen()) closeGuide();
                return true;
            }
            if (controlMode) {
                showHud();
                move(action, event);
                return true;
            }
            // First press only reveals the controls
            showHud();
            focusElement(lastControl && isVisible(lastControl) && els.stage.contains(lastControl)
                ? lastControl
                : (errorShown ? els.retryButton : els.playButton));
            return true;
        case 'ok':
            if (!errorShown && !els.unmutePill.hidden && onSurface()) {
                unmuteFromGesture();
                return true;
            }
            if (!onSurface()) return false; // native click on the focused button
            if (errorShown) {
                focusElement(els.retryButton);
                return true;
            }
            openGuide();
            return true;
        case 'escape':
            // The browser leaves fullscreen on Esc by itself
            if (fullscreenElement()) return false;
            layerBack();
            return true;
        case 'back':
            backFromRemote();
            return true;
        case 'backspace':
            if (!onSurface()) return false;
            recallPrevious();
            return true;
        case 'channel-up':
        case 'page-up':
            if (guideActive) {
                pageGuide(-5);
                return true;
            }
            zap(1);
            return true;
        case 'channel-down':
        case 'page-down':
            if (guideActive) {
                pageGuide(5);
                return true;
            }
            zap(-1);
            return true;
        case 'play-pause':
            player.togglePlay();
            showHud();
            return true;
        case 'play':
            if (player.isPaused()) player.togglePlay();
            return true;
        case 'pause':
            if (!player.isPaused()) player.togglePlay();
            showHud();
            return true;
        case 'stop':
            layerBack();
            return true;
        case 'yellow':
        case 'char:s':
            toggleFavoriteCurrent();
            return true;
        case 'blue':
        case 'guide':
        case 'char:g':
            toggleGuide();
            return true;
        case 'captions':
        case 'char:c':
            toggleCaptions();
            return true;
        case 'info':
        case 'green':
        case 'char:i':
        case 'system-volume':
            showHud();
            return action !== 'system-volume';
        case 'space':
        case 'char:k':
            // A focused button clicks itself on Space
            if (action === 'space' && !onSurface()) return false;
            player.togglePlay();
            showHud();
            return true;
        case 'char:m':
            if (isTvMode()) return false;
            player.toggleMute();
            showHud();
            return true;
        case 'volume-up':
            nudgeVolume(0.05);
            return true;
        case 'volume-down':
            nudgeVolume(-0.05);
            return true;
        case 'char:f':
            if (isTvMode()) return false;
            doFullscreen();
            return true;
        case 'char:p':
            if (els.pipButton.hidden) return false;
            togglePip(player.getVideo());
            return true;
        case 'char:l':
            player.jumpToLive();
            showHud();
            return true;
        default:
            return false;
    }
}

/* ---------- Gestures ---------- */

function isControlTarget(target) {
    return !!(target && target.closest && target.closest('button, input, a, .guide, .stage-error'));
}

function onStageTap() {
    if (!errorShown && player.isForcedMute() && !els.unmutePill.hidden) {
        unmuteFromGesture();
        return;
    }
    if (hudVisible() && !tuning && !errorShown) {
        hideHud(true);
    } else {
        showHud();
    }
}

function initGestures() {
    let start = null;
    let lastTouchEnd = 0;

    els.stage.addEventListener('touchstart', (event) => {
        if (event.touches.length !== 1 || isControlTarget(event.target)) {
            start = null;
            return;
        }
        const touch = event.touches[0];
        const edge = 24;
        // Screen edges belong to the iOS / Android back gestures
        if (touch.clientX < edge || touch.clientX > window.innerWidth - edge) {
            start = null;
            return;
        }
        start = { x: touch.clientX, y: touch.clientY, t: Date.now() };
    }, { passive: true });

    els.stage.addEventListener('touchmove', (event) => {
        if (start && event.touches.length !== 1) start = null;
    }, { passive: true });

    els.stage.addEventListener('touchend', (event) => {
        if (!start) return;
        const touch = event.changedTouches[0];
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        const dt = Date.now() - start.t;
        start = null;
        lastTouchEnd = Date.now();

        const width = els.stage.clientWidth || window.innerWidth;
        const fast = dt < 700 || Math.abs(dx) / Math.max(dt, 1) > 0.4;
        if (Math.abs(dx) >= Math.max(60, width * 0.15) && Math.abs(dx) > Math.abs(dy) * 1.5 && fast) {
            event.preventDefault();
            zap(dx < 0 ? 1 : -1);
            return;
        }
        // Landscape only: vertical swipes zap too (portrait scrolls the list)
        const landscape = window.innerWidth > window.innerHeight;
        if (landscape && Math.abs(dy) >= 60 && Math.abs(dy) > Math.abs(dx) * 1.5 && fast) {
            event.preventDefault();
            zap(dy < 0 ? 1 : -1);
            return;
        }
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 400) {
            event.preventDefault();
            onStageTap();
        }
    });

    els.stage.addEventListener('click', (event) => {
        if (Date.now() - lastTouchEnd < 700 || isControlTarget(event.target)) return;
        onStageTap();
    });

    els.stage.addEventListener('dblclick', (event) => {
        if (isControlTarget(event.target) || isTvMode()) return;
        doFullscreen();
    });

    // Taps also fire compatibility mouse events; they must not count as hover
    els.watch.addEventListener('touchstart', () => {
        lastTouchAt = Date.now();
        hudHover = false;
    }, { passive: true, capture: true });
    els.watch.addEventListener('touchend', () => {
        lastTouchAt = Date.now();
    }, { passive: true, capture: true });

    let lastX = -1;
    let lastY = -1;
    els.watch.addEventListener('mousemove', (event) => {
        if (fromTouch()) return;
        // Ignore synthetic mousemoves after layout changes
        if (Math.abs(event.clientX - lastX) <= 4 && Math.abs(event.clientY - lastY) <= 4) return;
        lastX = event.clientX;
        lastY = event.clientY;
        // Back to the mouse after Tab: let the controls hide again
        if (controlsHaveFocus() && !(event.target.closest && event.target.closest('.hud'))) focusSurface();
        showHud();
    }, { passive: true });

    $$('.hud, .guide', els.watch).forEach((area) => {
        area.addEventListener('mouseenter', () => {
            if (!fromTouch()) hudHover = true;
        });
        area.addEventListener('mouseleave', () => { hudHover = false; });
    });

    // LG Magic Remote: the pointer hid, so it no longer hovers anything
    document.addEventListener('cursorStateChange', (event) => {
        if (event && event.detail && !event.detail.visibility) hudHover = false;
    });

    // Tab must reveal the controls before the browser looks for the next
    // focusable element (hidden controls are not focusable)
    document.addEventListener('keydown', (event) => {
        if (watching && (event.key === 'Tab' || event.keyCode === 9) && !isSheetOpen()) showHud();
    }, true);

    // Pointer use in the channel list postpones the TV auto-close
    els.guide.addEventListener('mousemove', bumpGuideIdle, { passive: true });
    els.guide.addEventListener('focusin', bumpGuideIdle);
    els.guideList.addEventListener('scroll', bumpGuideIdle, { passive: true });
}

/* ---------- Init ---------- */

function bindPlayerEvents() {
    on('player:playing', () => {
        setTuning(false);
        hideStageError();
        renderCapabilities();
        renderPlayState();
        renderLive();
        showHud();
    });
    on('player:error', (payload) => {
        if (!watching) {
            if (detachedInPip) {
                detachedInPip = false;
                emit('pip:detached', null);
            }
            return;
        }
        // HEVC-only rendition on a browser that can't decode it: the same feed
        // has an H.264 variant (the one Firefox always gets)
        if (payload && payload.code === 'codecs' && lastUrl && /_hevc/.test(lastUrl) && !avcRetried) {
            avcRetried = true;
            // New token: the failed attempt's promise chain must not stop this one
            const token = ++tuneToken;
            lastUrl = toAvcUrl(lastUrl);
            player.play(lastUrl)
                .then(() => {
                    if (token === tuneToken) renderCapabilities();
                })
                .catch(() => {});
            return;
        }
        showStageError(payload && payload.message);
    });
    on('player:blocked', () => {
        // Autoplay refused, or paused before the first frame: offer Play
        startBlocked = true;
        setTuning(false);
        renderPlayState();
        showHud();
    });
    on('player:buffering', (payload) => {
        els.buffering.hidden = !(payload && payload.active) || tuning || errorShown;
    });
    on('player:state', (payload) => {
        // Play pressed on a blocked start: show loading until the first frame
        if (watching && payload && !payload.paused && startBlocked && !errorShown
            && player.isActive() && !player.hasStarted()) {
            startBlocked = false;
            setTuning(true);
        }
        renderPlayState();
        renderLive();
        if (watching) showHud();
    });
    on('player:volume', renderVolume);
    on('player:autoplay-muted', () => {
        els.unmutePill.hidden = false;
        els.unmuteText.textContent = isTvMode()
            ? 'Press OK for sound'
            : window.matchMedia('(pointer: coarse)').matches ? 'Tap for sound' : 'Click for sound';
        showHud();
    });
    on('player:memory-warning', () => {
        showToast('Memory is running low — reload the page if playback stutters', 5000);
    });
    on('player:pip', (payload) => {
        pipActive = !!(payload && payload.active);
        if (pipActive || !detachedInPip) return;
        // PiP window closed while browsing: "back to tab" keeps playing
        if (player.isPaused()) {
            detachedInPip = false;
            emit('pip:detached', null);
            player.stop();
        } else {
            returnFromPip();
        }
    });
    on('player:airplay', (payload) => {
        airplayAvailable = !!(payload && payload.available);
        renderCapabilities();
    });
    on('player:captions', renderCaptionsButton);
    on('player:caption-text', renderCaptionText);
    on('favorites', () => {
        renderFavorite();
        updateGuideStars();
    });
    on('pip:return', returnFromPip);
}

function bindControls() {
    els.backButton.addEventListener('click', exitWatch);
    els.prevButton.addEventListener('click', () => zap(-1));
    els.nextButton.addEventListener('click', () => zap(1));
    els.dockPrev.addEventListener('click', () => zap(-1));
    els.dockNext.addEventListener('click', () => zap(1));
    els.playButton.addEventListener('click', () => player.togglePlay());
    els.bigPlay.addEventListener('click', () => {
        player.togglePlay();
        showHud();
    });
    els.muteButton.addEventListener('click', () => player.toggleMute());
    els.volumeSlider.addEventListener('input', () => player.setVolume(Number(els.volumeSlider.value) / 100));
    els.volumeSlider.addEventListener('pointerdown', () => { sliderDragging = true; });
    document.addEventListener('pointerup', () => { sliderDragging = false; });
    // Left/Right adjust the slider; arrows otherwise belong to spatial nav
    els.volumeSlider.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft' || event.key === 'Left' || event.key === 'ArrowRight' || event.key === 'Right') {
            event.stopPropagation();
            showHud();
        }
    });
    els.favButton.addEventListener('click', toggleFavoriteCurrent);
    els.dockFavButton.addEventListener('click', toggleFavoriteCurrent);
    els.guideButton.addEventListener('click', toggleGuide);
    els.ccButton.addEventListener('click', toggleCaptions);
    els.guideClose.addEventListener('click', closeGuide);
    els.pipButton.addEventListener('click', () => togglePip(player.getVideo()));
    els.airplayButton.addEventListener('click', () => player.showAirplayPicker());
    els.fullscreenButton.addEventListener('click', doFullscreen);
    els.liveButton.addEventListener('click', () => {
        player.jumpToLive();
        renderLive();
    });
    els.unmutePill.addEventListener('click', unmuteFromGesture);
    els.retryButton.addEventListener('click', retry);
    els.errorNext.addEventListener('click', () => zap(1));
    els.errorGuide.addEventListener('click', exitWatch);

    // Remember the last control used, and keep pointer clicks from parking
    // focus on a button (arrows should keep zapping)
    $$('.hud [data-nav]', els.stage).forEach((control) => {
        control.addEventListener('focus', () => {
            lastControl = control;
            showHud();
        });
        control.addEventListener('click', () => {
            if (!isKeyboardMode()) focusSurface();
            showHud();
        });
    });

    ['fullscreenchange', 'webkitfullscreenchange'].forEach((name) => {
        document.addEventListener(name, () => {
            renderCapabilities();
            // Only the fullscreen element's subtree is drawn: bring the toast
            // and channel-number OSD along
            const host = fullscreenElement() || document.body;
            ['#toast', '#numberEntry'].forEach((selector) => {
                const el = $(selector);
                if (el && el.parentNode !== host) host.appendChild(el);
            });
            if (!fullscreenElement()) {
                try {
                    if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
                } catch (_error) { /* unsupported */ }
            }
        });
    });

    const video = player.getVideo();
    // iPhone native fullscreen: our controls are gone until it ends
    video.addEventListener('webkitendfullscreen', () => {
        renderPlayState();
        showHud();
    });

    let liveTick = 0;
    video.addEventListener('timeupdate', () => {
        const now = Date.now();
        if (now - liveTick < 1000 || !watching) return;
        liveTick = now;
        renderLive();
    });
}

export function initWatch() {
    els = {
        watch: $('#watch'),
        stage: $('#stage'),
        captions: $('#captions'),
        captionsText: $('#captionsText'),
        tuning: $('#tuning'),
        tuningLogo: $('#tuningLogo'),
        tuningName: $('#tuningName'),
        buffering: $('#buffering'),
        bigPlay: $('#bigPlay'),
        stageError: $('#stageError'),
        errorTitle: $('#stageErrorTitle'),
        errorText: $('#stageErrorText'),
        retryButton: $('#retryButton'),
        errorNext: $('#errorNextButton'),
        errorGuide: $('#errorGuideButton'),
        unmutePill: $('#unmutePill'),
        unmuteText: $('#unmuteText'),
        backButton: $('#backButton'),
        liveButton: $('#liveButton'),
        liveButtonText: $('#liveButtonText'),
        nowLogo: $('#nowLogo'),
        nowNumber: $('#nowNumber'),
        nowName: $('#nowName'),
        nowGroup: $('#nowGroup'),
        prevButton: $('#prevButton'),
        playButton: $('#playButton'),
        nextButton: $('#nextButton'),
        muteButton: $('#muteButton'),
        volumeSlider: $('#volumeSlider'),
        favButton: $('#favButton'),
        guideButton: $('#guideButton'),
        ccButton: $('#ccButton'),
        airplayButton: $('#airplayButton'),
        pipButton: $('#pipButton'),
        fullscreenButton: $('#fullscreenButton'),
        guide: $('#guide'),
        guideList: $('#guideList'),
        guideClose: $('#guideClose'),
        dockLogo: $('#dockLogo'),
        dockNumber: $('#dockNumber'),
        dockName: $('#dockName'),
        dockGroup: $('#dockGroup'),
        dockPrev: $('#dockPrev'),
        dockNext: $('#dockNext'),
        dockFavButton: $('#dockFavButton')
    };

    els.stage.setAttribute('tabindex', '-1');
    player.initPlayer($('#video'), { profile: isTvMode() ? 'tv' : 'auto' });

    bindPlayerEvents();
    bindControls();
    initGestures();
    initMediaSession();
    renderVolume();

    dockedMql = onMediaChange(DOCKED_QUERY, () => {
        if (isDocked() && isOpen('guide')) closeGuide();
        if (watching) {
            renderGuideCurrent(true);
            showHud();
        }
    });

    on('playlist', () => {
        renderGuide();
        if (state.current) {
            // Keep the playing channel object in sync with the refreshed list
            const fresh = findChannelByKey(state.current.key);
            if (fresh) state.current = fresh;
            state.zapList = state.zapList.map((item) => findChannelByKey(item.key)).filter(Boolean);
            if (!state.zapList.length) state.zapList = state.channels.slice();
        }
    });
}
