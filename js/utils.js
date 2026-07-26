// utils.js - Utility functions for myTV

/**
 * Show loading message overlay on video container
 * @param {string} message - Message to display
 */
function showLoadingMessage(message = 'Loading buffer...') {
    const container = document.getElementById('videoContainer');
    if (!container) return;

    if (!loadingStatusElement) {
        loadingStatusElement = document.createElement('div');
        loadingStatusElement.className = 'loading-status-overlay';

        const spinner = document.createElement('span');
        spinner.className = 'loading-spinner';
        spinner.setAttribute('aria-hidden', 'true');

        const textNode = document.createElement('span');
        textNode.className = 'loading-text';

        loadingStatusElement.appendChild(spinner);
        loadingStatusElement.appendChild(textNode);
    }

    const textElement = loadingStatusElement.querySelector('.loading-text');
    if (textElement) {
        textElement.textContent = message;
    }

    if (loadingStatusElement.parentElement !== container) {
        container.appendChild(loadingStatusElement);
    }

    loadingStatusElement.style.display = 'flex';
}

/**
 * Hide loading message overlay
 */
function hideLoadingMessage() {
    if (loadingStatusElement) {
        loadingStatusElement.style.display = 'none';
    }
}

/**
 * Show a non-blocking toast message
 * @param {string} message
 * @param {number} durationMs
 */
function showToast(message, durationMs = 3200) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.hidden = false;

    if (toastTimer) {
        clearTimeout(toastTimer);
    }

    toastTimer = setTimeout(() => {
        toast.hidden = true;
        toastTimer = null;
    }, durationMs);
}

/**
 * Show an in-app error with optional retry action
 * @param {string} message
 * @param {Function|null} onRetry
 */
function showErrorState(message, onRetry = null) {
    const channelPicker = document.getElementById('channelPicker');
    if (!channelPicker) {
        showToast(message);
        return;
    }

    channelPicker.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'error-state';

    const text = document.createElement('div');
    text.textContent = message;
    wrap.appendChild(text);

    if (typeof onRetry === 'function') {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Retry';
        button.addEventListener('click', onRetry);
        wrap.appendChild(button);
    }

    channelPicker.appendChild(wrap);
}

/**
 * Normalize playback options to consistent format
 * @param {Object|null} options - Playback options
 * @returns {Object} Normalized options
 */
function normalizePlaybackOptions(options) {
    const defaults = {
        headers: null,
        initialLiveBufferSeconds: 0,
        postReadyDelayMs: 0,
        loadingMessage: null
    };

    if (!options) {
        return defaults;
    }

    if (typeof options !== 'object' || Array.isArray(options)) {
        return defaults;
    }

    const recognizedKeys = ['headers', 'initialLiveBufferSeconds', 'postReadyDelayMs', 'loadingMessage'];
    const hasRecognizedKey = recognizedKeys.some(key => Object.prototype.hasOwnProperty.call(options, key));

    if (hasRecognizedKey) {
        return {
            headers: options.headers || null,
            initialLiveBufferSeconds: typeof options.initialLiveBufferSeconds === 'number' ? options.initialLiveBufferSeconds : 0,
            postReadyDelayMs: typeof options.postReadyDelayMs === 'number' ? options.postReadyDelayMs : 0,
            loadingMessage: typeof options.loadingMessage === 'string' ? options.loadingMessage : null
        };
    }

    return {
        ...defaults,
        headers: options
    };
}

/**
 * Detect whether the current device should use a lighter HLS buffer profile.
 */
function shouldUseMobileHlsProfile() {
    if (typeof navigator !== 'undefined' && typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4) {
        return true;
    }
    return window.matchMedia('(max-width: 1023px), (pointer: coarse)').matches;
}

/**
 * Build HLS.js config tuned for the current device.
 * @param {Object} [overrides]
 */
function getHlsConfig(overrides = {}) {
    const mobile = shouldUseMobileHlsProfile();
    const base = mobile
        ? {
            enableWorker: true,
            lowLatencyMode: false,
            liveSyncDuration: 18,
            liveMaxLatencyDuration: 40,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            backBufferLength: 20,
            maxBufferSize: 60 * 1000 * 1000,
            maxBufferHole: 0.5,
            manifestLoadingTimeOut: 10000,
            manifestLoadingMaxRetry: 3,
            levelLoadingTimeOut: 10000,
            fragLoadingTimeOut: 20000,
            fragLoadingMaxRetry: 3
        }
        : {
            enableWorker: true,
            lowLatencyMode: false,
            liveSyncDuration: 25,
            liveMaxLatencyDuration: 50,
            maxBufferLength: 60,
            maxMaxBufferLength: 120,
            backBufferLength: 30,
            maxBufferSize: 250 * 1000 * 1000,
            maxBufferHole: 0.5,
            manifestLoadingTimeOut: 10000,
            manifestLoadingMaxRetry: 3,
            levelLoadingTimeOut: 10000,
            fragLoadingTimeOut: 20000,
            fragLoadingMaxRetry: 3
        };

    return { ...base, ...overrides };
}

/**
 * Apply common mobile-safe attributes to a media element.
 * @param {HTMLMediaElement} media
 */
function applyMobileMediaAttributes(media) {
    if (!media) return;
    media.setAttribute('playsinline', '');
    media.setAttribute('webkit-playsinline', '');
    media.setAttribute('x-webkit-airplay', 'allow');
}
