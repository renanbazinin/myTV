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
        loadingStatusElement.style.position = 'absolute';
        loadingStatusElement.style.top = '50%';
        loadingStatusElement.style.left = '50%';
        loadingStatusElement.style.transform = 'translate(-50%, -50%)';
        loadingStatusElement.style.padding = '0.85rem 1.5rem';
        loadingStatusElement.style.borderRadius = '999px';
        loadingStatusElement.style.background = 'rgba(15, 15, 15, 0.75)';
        loadingStatusElement.style.color = '#fff';
        loadingStatusElement.style.fontSize = '1rem';
        loadingStatusElement.style.fontWeight = '600';
        loadingStatusElement.style.letterSpacing = '0.02em';
        loadingStatusElement.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.35)';
        loadingStatusElement.style.zIndex = '10';
        loadingStatusElement.style.display = 'none';
        loadingStatusElement.style.alignItems = 'center';
        loadingStatusElement.style.justifyContent = 'center';
        loadingStatusElement.style.gap = '0.65rem';
        loadingStatusElement.style.pointerEvents = 'none';

        const spinner = document.createElement('span');
        spinner.className = 'loading-spinner';
        spinner.style.width = '1rem';
        spinner.style.height = '1rem';
        spinner.style.border = '2px solid rgba(255, 255, 255, 0.2)';
        spinner.style.borderTopColor = '#fff';
        spinner.style.borderRadius = '50%';
        spinner.style.animation = 'loading-spin 1s linear infinite';

        const textNode = document.createElement('span');
        textNode.className = 'loading-text';

        loadingStatusElement.appendChild(spinner);
        loadingStatusElement.appendChild(textNode);
    }

    const textElement = loadingStatusElement.querySelector('.loading-text');
    if (textElement) {
        textElement.textContent = message;
    } else {
        loadingStatusElement.textContent = message;
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
 * Inject keyframes for spinner animation if not already present
 */
function ensureLoadingSpinnerStyles() {
    const existing = document.getElementById('loading-spinner-styles');
    if (existing) return;

    const style = document.createElement('style');
    style.id = 'loading-spinner-styles';
    style.textContent = `
        @keyframes loading-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
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

// Initialize spinner styles on load
ensureLoadingSpinnerStyles();
