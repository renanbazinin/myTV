// player.js - HLS playback engine for myTV
//
// Owns ONE persistent <video> for the whole session (re-creating it per
// channel would end Picture-in-Picture, iPhone fullscreen and AirPlay, and
// re-trigger muted autoplay on iOS) plus the hls.js instances. It never builds
// UI; it reports through store events:
//   player:loading {message}   player:playing   player:error {message, code, url}
//   player:buffering {active}  player:state {paused}   player:volume
//   player:autoplay-muted      player:blocked (needs a Play press)
//   player:memory-warning      player:stopped
//   player:pip {active}        player:airplay {available}
// Captions (captions.js): player:captions, player:caption-text {text, top}

import { state, emit, persistVolume } from './store.js';
import { DEFAULT_VOLUME, TUNE_TIMEOUT_MS, HLS_JS_URL } from './config.js';
import { attachCaptions, resetCaptions, bindHls as bindHlsCaptions, useNativeTracks } from './captions.js';

let video = null;
let profile = 'auto';

let audioElement = null;
let hlsVideo = null;
let hlsAudio = null;
let engine = null; // 'hlsjs' | 'native' | null
let nativeUrl = null;

// Incremented on every play/stop so late callbacks from an old stream are ignored
let session = 0;
let activeSession = 0;
let started = false;
let onSessionPlaying = null;
let onSessionNativeError = null;

let tuneTimer = null;
let armTuneTimer = null;
let memoryTimer = null;
let syncTimer = null;
let forcedMute = false;
let pausedAt = 0;
let blessed = false;
let stoppedWhileHidden = false;
let lastMemoryWarning = 0;
let hlsPromise = null;

// Stall watchdog (see "Stall watchdog" below)
let watchdogTimer = null;
let onSessionStall = null;
let onSessionResume = null;
// Playback intent: cleared by a 'pause' event (the user, a call, headphones
// out). A media reset pauses the element without one.
let wantPlaying = false;
let buffering = false;
let progressAt = 0;
let progressPos = 0;
let lastTickAt = 0;
let stallStep = 0;
let restartTimes = [];

/* ---------- Setup ---------- */

/**
 * Attach the engine to the page's persistent <video>
 * @param {HTMLVideoElement} videoElement
 * @param {{profile?: 'tv'|'auto'}} [options]
 */
export function initPlayer(videoElement, options) {
    video = videoElement;
    profile = (options && options.profile) || 'auto';

    video.controls = false;
    video.autoplay = false;
    video.preload = 'none';
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('x-webkit-airplay', 'allow');
    applyVolume(true);

    const current = () => activeSession !== 0 && activeSession === session;

    video.addEventListener('playing', () => {
        if (!current()) return;
        pausedAt = 0;
        if (onSessionPlaying) onSessionPlaying();
        markProgress();
        setBuffering(false);
    });
    video.addEventListener('waiting', () => {
        if (!current() || !started) return;
        setBuffering(true);
    });
    // 'playing' doesn't always follow 'waiting' when playback picks up again
    // (seeks, media resets): the playhead moving ends the spinner too
    video.addEventListener('timeupdate', () => {
        if (current() && started && notePlayhead()) setBuffering(false);
    });
    video.addEventListener('play', () => {
        if (!current()) return;
        wantPlaying = true;
        // Resumed from the background (media keys, the PiP window) after
        // loading was stopped there
        if (stoppedWhileHidden && hlsVideo) {
            stoppedWhileHidden = false;
            try { hlsVideo.startLoad(-1); } catch (_error) { /* no-op */ }
        }
        emit('player:state', { paused: false });
    });
    video.addEventListener('pause', () => {
        if (!current()) return;
        wantPlaying = false;
        // System pauses too (lock screen, headphones out, a call): resuming
        // later should jump back to live
        if (started && !pausedAt) pausedAt = Date.now();
        setBuffering(false);
        emit('player:state', { paused: true });
    });
    video.addEventListener('error', () => {
        if (!current() || engine !== 'native' || !nativeUrl) return;
        if (onSessionNativeError) onSessionNativeError('error');
    });

    video.addEventListener('enterpictureinpicture', () => emit('player:pip', { active: true }));
    video.addEventListener('leavepictureinpicture', () => emit('player:pip', { active: false }));
    video.addEventListener('webkitpresentationmodechanged', () => {
        emit('player:pip', { active: video.webkitPresentationMode === 'picture-in-picture' });
    });
    if (window.WebKitPlaybackTargetAvailabilityEvent) {
        video.addEventListener('webkitplaybacktargetavailabilitychanged', (event) => {
            emit('player:airplay', { available: event.availability === 'available' });
        });
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    attachCaptions(video);
}

export function getVideo() {
    return video;
}

export function isActive() {
    return activeSession !== 0 && activeSession === session;
}

/**
 * The current stream has shown its first frame
 */
export function hasStarted() {
    return isActive() && started;
}

/**
 * Prefer Apple's native HLS (keeps AirPlay, native fullscreen and power
 * management). Override with ?engine=hlsjs / ?engine=native for testing.
 */
function preferNative() {
    const search = window.location.search;
    if (/[?&]engine=hlsjs\b/.test(search)) return false;
    if (/[?&]engine=native\b/.test(search)) return true;
    return /Apple/.test(navigator.vendor || '') && !!video.canPlayType('application/vnd.apple.mpegurl');
}

function canPlayNative() {
    return !!video.canPlayType('application/vnd.apple.mpegurl');
}

/**
 * Load hls.js on first use (keeps 0.5 MB of parsing off the first paint)
 * @returns {Promise<Function>} the Hls constructor
 */
export function loadHls() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (hlsPromise) return hlsPromise;

    hlsPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const timer = setTimeout(() => {
            hlsPromise = null;
            reject(new Error('Timed out loading the video player'));
        }, 20000);
        script.src = HLS_JS_URL;
        script.async = true;
        script.onload = () => {
            clearTimeout(timer);
            if (window.Hls) {
                resolve(window.Hls);
            } else {
                hlsPromise = null;
                reject(new Error('Video player failed to start'));
            }
        };
        script.onerror = () => {
            clearTimeout(timer);
            hlsPromise = null;
            if (script.parentNode) script.parentNode.removeChild(script);
            reject(new Error("Couldn't load the video player. Check your connection."));
        };
        document.head.appendChild(script);
    });
    return hlsPromise;
}

/**
 * Warm up hls.js in the background when it will be needed
 */
export function preloadEngine() {
    if (video && !preferNative()) {
        loadHls().catch(() => {});
    }
}

/**
 * Call synchronously inside a tap/click/key handler before an async tune:
 * WebKit then allows the later, programmatic play() with sound.
 */
export function prime() {
    if (blessed || !video) return;
    // Outside a gesture (auto-play on start) priming can't help; keep it for the first real tap
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    blessed = true;
    if (!video.paused) return;
    try {
        video.muted = isMuted();
        const result = video.play();
        if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch (_error) {
        // Nothing to play yet
    }
}

/**
 * HLS.js config tuned for the device
 * @param {Object} [overrides]
 */
function getHlsConfig(overrides) {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const lowMemory = typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4;
    const light = coarse || lowMemory || window.matchMedia('(max-width: 767px)').matches;
    const saveData = !!(navigator.connection && navigator.connection.saveData);

    let base;
    if (profile === 'tv') {
        // TV browsers get a few hundred MB and one or two hardware decoders
        base = {
            liveSyncDuration: 18,
            liveMaxLatencyDuration: 40,
            maxBufferLength: 20,
            maxMaxBufferLength: 30,
            backBufferLength: 10,
            maxBufferSize: 40 * 1000 * 1000
        };
    } else if (light) {
        base = {
            liveSyncDuration: 18,
            liveMaxLatencyDuration: 40,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            backBufferLength: 20,
            maxBufferSize: 60 * 1000 * 1000
        };
    } else {
        base = {
            liveSyncDuration: 25,
            liveMaxLatencyDuration: 50,
            maxBufferLength: 60,
            maxMaxBufferLength: 120,
            backBufferLength: 30,
            maxBufferSize: 250 * 1000 * 1000
        };
    }

    return Object.assign({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferHole: 0.5,
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 3,
        levelLoadingTimeOut: 10000,
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 3,
        // Don't pull 1080p into a 220px-tall phone player
        capLevelToPlayerSize: true,
        maxDevicePixelRatio: saveData ? 1 : 2,
        startLevel: saveData ? 0 : undefined,
        // Captions come to captions.js as cues: TextTracks hls.js adds to the
        // persistent <video> could never be removed again
        renderTextTracksNatively: false,
        // Some CDNs (Keshet 12's) now and then serve a live playlist that
        // doesn't line up with the previous one ("media sequence mismatch").
        // hls.js 1.6 then stops refreshing that playlist for good; for the
        // only audio rendition that freezes the picture minutes later, with
        // no fatal error. Keep refreshing instead.
        ignorePlaylistParsingErrors: true
    }, base, overrides || {});
}

function safePlay(media) {
    try {
        const result = media.play();
        return result && typeof result.then === 'function' ? result : Promise.resolve();
    } catch (error) {
        return Promise.reject(error);
    }
}

/* ---------- Teardown ---------- */

function clearTimers() {
    clearTimeout(tuneTimer);
    tuneTimer = null;
    clearInterval(memoryTimer);
    memoryTimer = null;
    clearInterval(syncTimer);
    syncTimer = null;
    clearInterval(watchdogTimer);
    watchdogTimer = null;
}

function destroyHls(instance) {
    if (!instance) return;
    try {
        if (instance.media) instance.detachMedia();
        instance.destroy();
    } catch (error) {
        console.warn('[player] Failed to destroy HLS instance:', error);
    }
}

function resetMedia(media) {
    if (!media) return;
    try { media.pause(); } catch (_error) { /* no-op */ }
    try { media.playbackRate = 1; } catch (_error) { /* no-op */ }
    try {
        media.removeAttribute('src');
        media.load();
    } catch (_error) { /* no-op */ }
}

/**
 * Release the current stream but keep the <video> element
 */
function teardownStream() {
    clearTimers();
    destroyHls(hlsVideo);
    destroyHls(hlsAudio);
    hlsVideo = null;
    hlsAudio = null;
    if (audioElement) {
        resetMedia(audioElement);
        if (audioElement.parentNode) audioElement.parentNode.removeChild(audioElement);
        audioElement = null;
    }
    resetMedia(video);
    resetCaptions();
    engine = null;
    nativeUrl = null;
    started = false;
    onSessionPlaying = null;
    onSessionNativeError = null;
    onSessionStall = null;
    onSessionResume = null;
    armTuneTimer = null;
    stoppedWhileHidden = false;
    pausedAt = 0;
    wantPlaying = false;
    stallStep = 0;
    restartTimes = [];
    setBuffering(false);
}

/**
 * Autoplay was refused outright, or the user paused before the first frame:
 * stop the start-up timeout and let the UI show a Play button instead
 */
function blockStart() {
    clearTimeout(tuneTimer);
    tuneTimer = null;
    emit('player:blocked');
}

function codedError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
}

/**
 * Stop playback and free every media resource
 */
export function stop() {
    session += 1;
    activeSession = 0;
    teardownStream();
    forcedMute = false;
    applyVolume(true);
    emit('player:stopped');
}

/* ---------- Monitoring ---------- */

/**
 * Watch heap usage (Chrome/Edge desktop & TV) and trim back-buffer when high
 */
function startMemoryMonitor() {
    if (!window.performance || !performance.memory) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;
    clearInterval(memoryTimer);

    memoryTimer = setInterval(() => {
        const usagePercent = (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100;

        if (usagePercent > 80 && window.Hls) {
            console.warn(`[player] High memory usage (${usagePercent.toFixed(1)}%), flushing back-buffer`);
            [[hlsVideo, video], [hlsAudio, audioElement]].forEach((pair) => {
                const hls = pair[0];
                const media = pair[1];
                if (!hls || !media) return;
                const keepPos = Math.max(0, media.currentTime - 30);
                if (keepPos > 0) {
                    try {
                        hls.trigger(window.Hls.Events.BUFFER_FLUSHING, { startOffset: 0, endOffset: keepPos });
                    } catch (error) {
                        console.warn('[player] Failed to flush buffer:', error);
                    }
                }
            });
        }

        if (usagePercent > 90 && Date.now() - lastMemoryWarning > 5 * 60 * 1000) {
            lastMemoryWarning = Date.now();
            emit('player:memory-warning');
        }
    }, 30000);
}

/* ---------- Stall watchdog ---------- */

// A live stream can stop moving without hls.js ever raising a fatal error: a
// playlist that stopped refreshing, a decoder that quietly gave up, an element
// a media reset left paused. Once a stream has started, a 1 s tick checks the
// playhead moves while it should and escalates instead of spinning forever.
const STALL_SPINNER_MS = 3000; // spinner even without a 'waiting' event
const STALL_RESUME_MS = 2000; // play again after a reset paused the element
// Recovery steps: reload the stream's data, restart the stream, give up (the
// error card offers Retry)
const STALL_STEP_MS = [8000, 18000, 40000];
const MAX_RESTARTS = 3;
const RESTART_WINDOW_MS = 10 * 60 * 1000;

function setBuffering(active) {
    if (buffering === active) return;
    buffering = active;
    emit('player:buffering', { active });
}

/**
 * The started stream is waiting for data (the spinner should show)
 */
export function isBuffering() {
    return buffering;
}

/**
 * Restart the stall clock: first frame, playback resumed, back from the background
 */
function markProgress() {
    progressPos = video.currentTime;
    progressAt = Date.now();
    stallStep = 0;
}

/**
 * Record playback progress. Seeks move the playhead too (live sync, nudges
 * over gaps) but aren't playback: follow them without counting them.
 * @returns {boolean} the playhead moved forward by playing
 */
function notePlayhead() {
    const position = video.currentTime;
    const delta = position - progressPos;
    if (video.seeking || Math.abs(delta) < 0.1) return false;
    progressPos = position;
    if (delta < 0 || delta > 5 || video.paused || video.readyState < 2) return false;
    progressAt = Date.now();
    stallStep = 0;
    return true;
}

/**
 * Seconds of media buffered from the playhead on
 */
function bufferedAhead() {
    const ranges = video.buffered;
    const position = video.currentTime;
    for (let i = 0; i < ranges.length; i++) {
        if (ranges.start(i) <= position + 0.1 && position < ranges.end(i)) {
            return ranges.end(i) - position;
        }
    }
    return 0;
}

function inPictureInPicture() {
    return document.pictureInPictureElement === video
        || video.webkitPresentationMode === 'picture-in-picture';
}

function startWatchdog() {
    clearInterval(watchdogTimer);
    markProgress();
    lastTickAt = Date.now();
    watchdogTimer = setInterval(checkStall, 1000);
}

function checkStall() {
    if (!isActive() || !started) return;
    const now = Date.now();
    const late = now - lastTickAt > 3000;
    lastTickAt = now;
    if (notePlayhead()) {
        setBuffering(false);
        return;
    }
    // Paused on purpose, or no way to judge: a background tab (throttled
    // timers, video may be suspended), AirPlay, or a late tick
    if (!wantPlaying || (document.hidden && !inPictureInPicture())
        || video.webkitCurrentPlaybackTargetIsWireless || late) {
        markProgress();
        return;
    }
    const stalled = now - progressAt;
    if (stalled >= STALL_SPINNER_MS) setBuffering(true);
    if (video.paused && stalled >= STALL_RESUME_MS && onSessionResume) {
        onSessionResume();
    }
    if (stallStep < STALL_STEP_MS.length && stalled >= STALL_STEP_MS[stallStep]) {
        stallStep += 1;
        if (onSessionStall) onSessionStall(stallStep);
    }
}

/**
 * Recover from fatal hls.js errors where possible, otherwise fail
 * @param {Hls} hls
 * @param {Function} fail
 */
function attachErrorRecovery(hls, fail) {
    const Hls = window.Hls;
    let networkRetries = 0;
    let lastNetworkError = 0;
    let mediaRetries = 0;
    let lastMediaError = 0;

    hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data || !data.fatal || hls !== hlsVideo) return;
        const details = data.details || 'unknown';

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            // The budget refills after a minute without network errors, not on
            // loaded fragments: video can keep loading while the audio
            // playlist fails, and the picture then waits for audio forever
            const now = Date.now();
            if (now - lastNetworkError > 60000) networkRetries = 0;
            lastNetworkError = now;
            if (!started) {
                // hls.js already retried; a dead channel must fail fast, not spin forever
                if (/manifest|level/i.test(details) || networkRetries >= 3) {
                    fail(new Error('This channel is not available right now.'));
                    return;
                }
            } else if (networkRetries >= 20) {
                fail(new Error('Lost connection to the stream.'));
                return;
            }
            // Once playing, keep trying while the buffer carries the picture:
            // the stall watchdog gives up when it has stopped for too long
            networkRetries += 1;
            console.warn(`[player] Network error (${details}), retry ${networkRetries}`);
            setTimeout(() => {
                if (hls !== hlsVideo) return;
                try {
                    // A manifest that failed (a watchdog restart) must load again
                    if (/manifest/i.test(details)) {
                        hls.loadSource(hls.url);
                    } else {
                        hls.startLoad();
                    }
                } catch (_error) { /* destroyed */ }
            }, Math.min(8000, 1000 * Math.pow(2, networkRetries - 1)));
            return;
        }

        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            // No playable rendition (e.g. HEVC-only on a browser without HEVC)
            if (details === Hls.ErrorDetails.MANIFEST_INCOMPATIBLE_CODECS_ERROR) {
                fail(codedError('This stream could not be decoded on this device.', 'codecs'));
                return;
            }
            // recoverMediaError() re-attaches the element, which pauses it
            const resume = !started || wantPlaying;
            const now = Date.now();
            mediaRetries = now - lastMediaError < 3000 ? mediaRetries + 1 : 1;
            lastMediaError = now;
            console.warn(`[player] Media error (${details}), recovery ${mediaRetries}`);
            if (mediaRetries === 1) {
                hls.recoverMediaError();
            } else if (mediaRetries === 2) {
                hls.swapAudioCodec();
                hls.recoverMediaError();
            } else {
                fail(codedError('This stream could not be decoded on this device.', 'codecs'));
                return;
            }
            if (resume) safePlay(video).catch(() => {});
            return;
        }

        fail(new Error('Playback error: ' + details));
    });
}

/* ---------- Play ---------- */

/**
 * Start playback on the persistent element, retrying muted when the browser
 * blocks sound. Called right after the source is attached (not after the
 * manifest), so it stays inside the user's gesture where possible.
 * @param {number} id - playback session
 * @param {Function} fail
 */
function startPlay(id, fail) {
    // A tap / key press that starts a channel may have sound again
    if (forcedMute && !state.muted && navigator.userActivation && navigator.userActivation.isActive) {
        forcedMute = false;
    }
    applyVolume(false);
    safePlay(video).catch((error) => {
        if (id !== session) return;
        const name = error && error.name;
        if (name === 'AbortError') return;
        if (name === 'NotAllowedError') {
            video.muted = true;
            forcedMute = true;
            emit('player:autoplay-muted');
            emit('player:volume');
            safePlay(video).catch(() => {
                // Even muted autoplay was refused (e.g. iOS Low Power Mode): show Play
                if (id === session && !started) blockStart();
            });
            return;
        }
        if (engine === 'native') {
            fail(new Error('This channel is not available right now.'));
        }
    });
}

/**
 * Play a single HLS stream
 * @param {string} url
 * @returns {Promise<void>} resolves when the first frame plays
 */
export function play(url) {
    teardownStream();
    session += 1;
    const id = session;
    activeSession = id;

    return new Promise((resolve, reject) => {
        let settled = false;
        let nativeRetries = 0;
        let lastNativeReload = 0;

        const fail = (error) => {
            if (id !== session) return;
            teardownStream();
            activeSession = 0;
            session += 1;
            emit('player:error', {
                message: (error && error.message) || 'Playback failed',
                code: (error && error.code) || null,
                url
            });
            if (!settled) {
                settled = true;
                reject(error);
            }
        };

        onSessionPlaying = () => {
            if (started) return;
            started = true;
            clearTimeout(tuneTimer);
            emit('player:playing');
            startMemoryMonitor();
            startWatchdog();
            if (!settled) {
                settled = true;
                resolve();
            }
        };

        onSessionResume = () => startPlay(id, fail);

        // Stall watchdog steps (see checkStall)
        onSessionStall = (step) => {
            if (step >= STALL_STEP_MS.length) {
                fail(new Error('Lost connection to the stream.'));
            } else if (engine === 'native') {
                // Reload the live source (onSessionNativeError keeps the budget)
                if (onSessionNativeError) onSessionNativeError('stall');
            } else if (step === 1 && hlsVideo) {
                if (bufferedAhead() >= 1) {
                    // The media is there but doesn't play: reset the pipeline
                    console.warn('[player] Stalled with media buffered, resetting playback');
                    hlsVideo.recoverMediaError();
                    startPlay(id, fail);
                } else {
                    // Nothing arrives: reload the playlists and fragments from here
                    console.warn('[player] Stalled waiting for media, reloading');
                    hlsVideo.startLoad();
                }
            } else if (hlsVideo) {
                const now = Date.now();
                restartTimes = restartTimes.filter((time) => now - time < RESTART_WINDOW_MS);
                if (restartTimes.length >= MAX_RESTARTS) {
                    fail(new Error('Lost connection to the stream.'));
                    return;
                }
                restartTimes.push(now);
                console.warn('[player] Still stalled, restarting the stream');
                startHls(window.Hls);
            }
        };

        const startNative = () => {
            engine = 'native';
            nativeUrl = url;
            onSessionNativeError = (reason) => {
                if (!started && reason === 'error') {
                    fail(new Error('This channel is not available right now.'));
                    return;
                }
                // Stalled or dropped: reload the live source, then give up. The
                // budget refills after a minute of healthy playback.
                if (lastNativeReload && Date.now() - lastNativeReload > 60000) nativeRetries = 0;
                if (nativeRetries >= 3) {
                    fail(new Error('Lost connection to the stream.'));
                    return;
                }
                nativeRetries += 1;
                lastNativeReload = Date.now();
                console.warn(`[player] Native HLS ${reason}, reloading (${nativeRetries})`);
                video.src = url;
                safePlay(video).catch(() => {});
            };
            video.src = url;
            useNativeTracks();
            startPlay(id, fail);
        };

        armTuneTimer = () => {
            clearTimeout(tuneTimer);
            tuneTimer = setTimeout(() => {
                fail(new Error('This channel is taking too long to start.'));
            }, TUNE_TIMEOUT_MS);
        };
        armTuneTimer();

        emit('player:loading', {});

        if (preferNative()) {
            startNative();
            return;
        }

        const startHls = (Hls) => {
            if (id !== session) return;
            if (!Hls.isSupported()) {
                if (canPlayNative()) {
                    startNative();
                } else {
                    fail(new Error('Live streams are not supported in this browser.'));
                }
                return;
            }
            engine = 'hlsjs';
            if (hlsVideo) {
                // Watchdog restart: a fresh instance and MediaSource, from the live edge
                destroyHls(hlsVideo);
                resetCaptions();
            }
            const hls = new Hls(getHlsConfig());
            hlsVideo = hls;
            attachErrorRecovery(hls, fail);
            bindHlsCaptions(hls);
            hls.attachMedia(video);
            hls.loadSource(url);
            startPlay(id, fail);
        };

        if (window.Hls) {
            startHls(window.Hls);
        } else {
            loadHls().then(startHls, (error) => {
                if (id !== session) return;
                if (canPlayNative()) {
                    startNative();
                } else {
                    fail(error);
                }
            });
        }
    });
}

function normalizePlaybackOptions(options) {
    const defaults = {
        headers: null,
        initialLiveBufferSeconds: 0,
        postReadyDelayMs: 0,
        loadingMessage: null
    };
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        return defaults;
    }
    const hasRecognizedKey = Object.keys(defaults).some((key) => Object.prototype.hasOwnProperty.call(options, key));
    if (!hasRecognizedKey) {
        // Legacy call style: the options object *is* the headers map
        return Object.assign({}, defaults, { headers: options });
    }
    return {
        headers: options.headers || null,
        initialLiveBufferSeconds: typeof options.initialLiveBufferSeconds === 'number' ? options.initialLiveBufferSeconds : 0,
        postReadyDelayMs: typeof options.postReadyDelayMs === 'number' ? options.postReadyDelayMs : 0,
        loadingMessage: typeof options.loadingMessage === 'string' ? options.loadingMessage : null
    };
}

function waitForMediaReady(media, timeout) {
    return new Promise((resolve, reject) => {
        if (media.readyState >= 2) {
            resolve();
            return;
        }
        let timer = null;
        const cleanup = () => {
            media.removeEventListener('canplay', onReady);
            media.removeEventListener('loadedmetadata', onReady);
            media.removeEventListener('error', onError);
            clearTimeout(timer);
        };
        const onReady = () => {
            cleanup();
            resolve();
        };
        const onError = () => {
            cleanup();
            reject(new Error('Failed to buffer media stream'));
        };
        timer = setTimeout(() => {
            cleanup();
            reject(new Error('Timed out while buffering media stream'));
        }, timeout || 12000);
        media.addEventListener('canplay', onReady);
        media.addEventListener('loadedmetadata', onReady);
        media.addEventListener('error', onError);
    });
}

function waitForSeekable(media, maxWait) {
    return new Promise((resolve) => {
        const ready = () => media.seekable && media.seekable.length > 0;
        if (ready()) {
            resolve();
            return;
        }
        let elapsed = 0;
        const timer = setInterval(() => {
            elapsed += 250;
            if (ready() || elapsed >= (maxWait || 10000)) {
                clearInterval(timer);
                resolve();
            }
        }, 250);
    });
}

function seekableEnd(media) {
    if (!media || !media.seekable || media.seekable.length === 0) return null;
    try {
        return media.seekable.end(media.seekable.length - 1);
    } catch (_error) {
        return null;
    }
}

/**
 * Play separate video and audio streams kept in sync (for channels that publish
 * them separately). Not used by the current playlist, kept for future channels.
 * @param {string} videoUrl
 * @param {string} audioUrl
 * @param {Object} [options] - {headers, initialLiveBufferSeconds, postReadyDelayMs, loadingMessage}
 * @returns {Promise<void>}
 */
export function playVideoAndAudio(videoUrl, audioUrl, options) {
    teardownStream();
    session += 1;
    const id = session;
    activeSession = id;
    const opts = normalizePlaybackOptions(options);
    const bufferSeconds = Math.max(opts.initialLiveBufferSeconds || 0, 0);
    const loadingMessage = opts.loadingMessage
        || (bufferSeconds >= 1 ? `Buffering stream (~${Math.round(bufferSeconds)}s)…` : null);

    return new Promise((resolve, reject) => {
        const audio = document.createElement('video');
        audio.className = 'video-aux';
        audio.style.display = 'none';
        audio.preload = 'auto';
        audio.setAttribute('playsinline', '');
        audio.setAttribute('webkit-playsinline', '');
        audioElement = audio;
        if (video.parentNode) video.parentNode.appendChild(audio);
        applyVolume(true);
        video.preload = 'auto';
        let settled = false;

        const fail = (error) => {
            if (id !== session) return;
            teardownStream();
            activeSession = 0;
            session += 1;
            emit('player:error', { message: (error && error.message) || 'Playback failed' });
            if (!settled) {
                settled = true;
                reject(error);
            }
        };

        onSessionPlaying = () => {
            if (started) return;
            started = true;
        };

        const alignInitialPosition = () => {
            let target = null;
            const videoEnd = seekableEnd(video);
            const audioEnd = seekableEnd(audio);
            const preferredOffset = bufferSeconds > 0 ? bufferSeconds : 1;

            if (videoEnd !== null && audioEnd !== null) {
                target = Math.min(videoEnd, audioEnd) - preferredOffset;
                if (!Number.isFinite(target) || target <= 0.1) target = null;
            }
            if (target === null) {
                const fallback = Math.max(video.currentTime || 0, audio.currentTime || 0) - bufferSeconds;
                if (Number.isFinite(fallback) && fallback > 0.1) target = fallback;
            }
            if (target !== null) {
                try { video.currentTime = Math.max(target, 0); } catch (_error) { /* no-op */ }
                try { audio.currentTime = Math.max(target, 0); } catch (_error) { /* no-op */ }
            }
        };

        const startSyncMonitor = () => {
            clearInterval(syncTimer);
            try { audio.playbackRate = 1; } catch (_error) { /* no-op */ }

            syncTimer = setInterval(() => {
                if (id !== session) return;
                if (video.readyState < 2 || audio.readyState < 2) return;
                const diff = audio.currentTime - video.currentTime;
                if (!Number.isFinite(diff)) return;

                if (Math.abs(diff) > 1.5) {
                    try { audio.currentTime = video.currentTime; } catch (error) {
                        console.warn('[player] Hard audio sync failed:', error);
                    }
                    audio.playbackRate = 1;
                } else if (Math.abs(diff) > 0.1) {
                    audio.playbackRate = diff > 0 ? 0.97 : 1.03;
                } else if (audio.playbackRate !== 1) {
                    audio.playbackRate = 1;
                }
            }, 500);
        };

        const beginPlayback = () => waitForMediaReady(video)
            .then(() => waitForMediaReady(audio))
            .then(() => Promise.all([waitForSeekable(video), waitForSeekable(audio)]))
            .then(() => {
                alignInitialPosition();
                if (opts.postReadyDelayMs > 0) {
                    return new Promise((done) => setTimeout(done, opts.postReadyDelayMs));
                }
                return null;
            })
            .then(() => {
                if (id !== session) return null;
                return safePlay(video).catch((error) => {
                    if (!error || error.name !== 'NotAllowedError') throw error;
                    video.muted = true;
                    forcedMute = true;
                    emit('player:autoplay-muted');
                    emit('player:volume');
                    return safePlay(video);
                });
            })
            .then(() => {
                if (id !== session) return null;
                audio.muted = video.muted;
                return safePlay(audio);
            })
            .then(() => {
                if (id !== session) return;
                startSyncMonitor();
                started = true;
                settled = true;
                clearTimeout(tuneTimer);
                emit('player:playing');
                startMemoryMonitor();
                resolve();
            })
            .catch(fail);

        tuneTimer = setTimeout(() => {
            fail(new Error('This channel is taking too long to start.'));
        }, TUNE_TIMEOUT_MS + (bufferSeconds * 1000));

        emit('player:loading', { message: loadingMessage });

        const startNative = () => {
            if (opts.headers) {
                console.warn('[player] Custom headers cannot be applied for native HLS playback.');
            }
            engine = 'native';
            const onError = () => fail(new Error('Failed to load HLS streams natively'));
            audio.addEventListener('error', onError, { once: true });
            video.src = videoUrl;
            audio.src = audioUrl;
            beginPlayback();
        };

        const startHls = (Hls) => {
            if (id !== session) return;
            if (!Hls.isSupported()) {
                if (canPlayNative()) {
                    startNative();
                } else {
                    fail(new Error('Live streams are not supported in this browser.'));
                }
                return;
            }
            engine = 'hlsjs';
            const config = getHlsConfig({
                liveSyncDuration: 12,
                liveMaxLatencyDuration: 30,
                maxBufferSize: profile === 'tv' || window.matchMedia('(pointer: coarse)').matches
                    ? 60 * 1000 * 1000
                    : 150 * 1000 * 1000
            });
            if (opts.headers && typeof opts.headers === 'object') {
                config.xhrSetup = (xhr) => {
                    Object.keys(opts.headers).forEach((key) => {
                        try {
                            xhr.setRequestHeader(key, opts.headers[key]);
                        } catch (error) {
                            console.warn('[player] Failed to set custom header:', error);
                        }
                    });
                };
            }

            hlsVideo = new Hls(config);
            hlsAudio = new Hls(config);

            const onFatal = (label) => (_event, data) => {
                if (!data || !data.fatal) return;
                fail(new Error(`Failed to load ${label} stream (${data.details || data.type || 'unknown error'})`));
            };
            hlsVideo.on(Hls.Events.ERROR, onFatal('video'));
            hlsAudio.on(Hls.Events.ERROR, onFatal('audio'));

            const manifestReady = (hls) => new Promise((done) => {
                hls.on(Hls.Events.MANIFEST_PARSED, () => done());
            });
            Promise.all([manifestReady(hlsVideo), manifestReady(hlsAudio)]).then(beginPlayback);

            hlsVideo.attachMedia(video);
            hlsVideo.loadSource(videoUrl);
            hlsAudio.attachMedia(audio);
            hlsAudio.loadSource(audioUrl);
        };

        if (preferNative()) {
            startNative();
        } else if (window.Hls) {
            startHls(window.Hls);
        } else {
            loadHls().then(startHls, (error) => {
                if (id !== session) return;
                if (canPlayNative()) {
                    startNative();
                } else {
                    fail(error);
                }
            });
        }
    });
}

/* ---------- Live edge ---------- */

function liveTarget() {
    if (hlsVideo && Number.isFinite(hlsVideo.liveSyncPosition) && hlsVideo.liveSyncPosition > 0) {
        return hlsVideo.liveSyncPosition;
    }
    const end = seekableEnd(video);
    return end !== null && Number.isFinite(end) ? Math.max(0, end - 3) : null;
}

/**
 * Whether playback has drifted well behind the live edge (after a pause)
 */
export function isBehindLive() {
    if (!isActive() || !started) return false;
    const target = liveTarget();
    if (target === null) return false;
    const threshold = engine === 'native' ? 45 : 15;
    return target - video.currentTime > threshold;
}

/**
 * Jump to the live edge and keep playing
 */
export function jumpToLive() {
    if (!isActive()) return;
    const target = liveTarget();
    if (target !== null) {
        try { video.currentTime = target; } catch (_error) { /* no-op */ }
        if (audioElement) {
            try { audioElement.currentTime = target; } catch (_error) { /* no-op */ }
        }
    }
    pausedAt = 0;
    if (video.paused) {
        safePlay(video).catch(() => {});
        if (audioElement) safePlay(audioElement).catch(() => {});
    }
}

function onVisibilityChange() {
    if (!isActive()) return;
    if (document.hidden) {
        // Paused in the background: stop downloading segments
        if (video.paused && hlsVideo) {
            try { hlsVideo.stopLoad(); } catch (_error) { /* no-op */ }
            stoppedWhileHidden = true;
        }
        return;
    }
    if (stoppedWhileHidden && hlsVideo) {
        stoppedWhileHidden = false;
        try { hlsVideo.startLoad(-1); } catch (_error) { /* no-op */ }
    }
    // The stall watchdog doesn't judge background time
    if (started) markProgress();
    if (!video.paused && isBehindLive()) {
        jumpToLive();
    }
}

/* ---------- Transport ---------- */

export function isPaused() {
    return !video || !isActive() || video.paused;
}

/**
 * Pause, or resume — jumping back to the live edge if paused for a while
 */
export function togglePlay() {
    if (!video || !isActive()) return;
    if (!video.paused) {
        pausedAt = Date.now();
        video.pause();
        if (audioElement) audioElement.pause();
        if (!started) blockStart();
        return;
    }
    // Still waiting for the first frame: a dead stream must still time out
    if (!started && armTuneTimer) armTuneTimer();
    if (started && pausedAt && Date.now() - pausedAt > 10000) {
        jumpToLive();
        return;
    }
    pausedAt = 0;
    safePlay(video).catch(() => {});
    if (audioElement) safePlay(audioElement).catch(() => {});
}

/* ---------- Volume ---------- */

export function isMuted() {
    return state.muted || forcedMute || state.volume === 0;
}

export function isForcedMute() {
    return forcedMute;
}

/**
 * Whether the page can change volume (iOS: hardware buttons only)
 */
export function volumeWritable() {
    if (!video) return false;
    const original = video.volume;
    try {
        video.volume = original === 0.5 ? 0.4 : 0.5;
    } catch (_error) {
        return false;
    }
    const writable = video.volume !== original;
    try { video.volume = original; } catch (_error) { /* no-op */ }
    return writable;
}

function applyVolume(silent) {
    [video, audioElement].forEach((media) => {
        if (!media) return;
        try { media.volume = state.volume; } catch (_error) { /* read-only on iOS */ }
        media.muted = isMuted();
    });
    if (!silent) emit('player:volume');
}

/**
 * Set volume 0..1. Raising it unmutes; zero mutes.
 * @param {number} value
 */
export function setVolume(value) {
    const volume = Math.max(0, Math.min(1, Number(value) || 0));
    state.volume = volume;
    if (volume > 0) {
        state.muted = false;
        forcedMute = false;
    }
    applyVolume(false);
    persistVolume();
}

/**
 * Mute / unmute. Call from a user gesture: WebKit pauses video that is
 * unmuted without one.
 * @param {boolean} muted
 */
export function setMuted(muted) {
    state.muted = !!muted;
    forcedMute = false;
    if (!state.muted && state.volume === 0) {
        state.volume = DEFAULT_VOLUME;
    }
    applyVolume(false);
    persistVolume();
    if (!state.muted && video && isActive() && video.paused && !pausedAt) {
        if (!started && armTuneTimer) armTuneTimer();
        safePlay(video).catch(() => {});
    }
}

export function toggleMute() {
    setMuted(!isMuted());
}

export function nudgeVolume(delta) {
    setVolume(Math.round((state.volume + delta) * 100) / 100);
}

/* ---------- AirPlay ---------- */

export function airplaySupported() {
    return !!(video && typeof video.webkitShowPlaybackTargetPicker === 'function' && window.WebKitPlaybackTargetAvailabilityEvent);
}

export function showAirplayPicker() {
    if (airplaySupported()) {
        try { video.webkitShowPlaybackTargetPicker(); } catch (_error) { /* no-op */ }
    }
}
