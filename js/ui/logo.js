// logo.js - Channel logos on 16:9 plates, with per-logo plate styles and a
// monogram fallback

import { h } from '../dom.js';
import { monogram } from '../playlist.js';
import { LOGO_STYLES } from '../config.js';

// Wikimedia only serves standard thumbnail widths; other sizes return HTTP 400
// (e.g. the Knesset logo at 1200px). 330px is plenty for a plate and keeps
// TV memory down.
const WIKIMEDIA_THUMB = /^(https?:\/\/upload\.wikimedia\.org\/.+\/thumb\/.+\/)(\d+)px-([^/]+)$/;

export function normalizeLogoUrl(url) {
    if (!url) return '';
    const match = WIKIMEDIA_THUMB.exec(url);
    if (match && match[2] !== '330') {
        return match[1] + '330px-' + match[3];
    }
    return url;
}

function styleFor(url) {
    for (let i = 0; i < LOGO_STYLES.length; i += 1) {
        if (url.indexOf(LOGO_STYLES[i].match) !== -1) return LOGO_STYLES[i];
    }
    return { mode: 'light' };
}

/**
 * imgur answers missing images with a 161x81 "image does not exist" PNG and
 * HTTP 200, so onerror never fires
 * @param {HTMLImageElement} img
 */
function isPlaceholder(img) {
    return /i\.imgur\.com/.test(img.src) && img.naturalWidth === 161 && img.naturalHeight === 81;
}

/**
 * Logo plate for a channel. The returned element fills its positioned parent.
 * @param {Object} channel
 * @param {string} [className]
 */
export function channelLogo(channel, className) {
    const url = normalizeLogoUrl(channel.logo);
    const style = url ? styleFor(url) : { mode: 'light' };
    const plate = h('span.plate.plate-' + style.mode + (className ? '.' + className : ''), { 'aria-hidden': 'true' });
    if (style.bg) {
        plate.style.backgroundColor = style.bg;
    }

    const fallback = () => {
        plate.textContent = '';
        plate.className = 'plate plate-monogram' + (className ? ' ' + className : '');
        plate.style.backgroundColor = '';
        plate.appendChild(h('span.plate-monogram-text', { text: monogram(channel.name) }));
    };

    if (!url) {
        fallback();
        return plate;
    }

    const img = h('img.plate-img', {
        alt: '',
        loading: 'lazy',
        decoding: 'async',
        referrerpolicy: 'no-referrer',
        draggable: 'false'
    });
    img.addEventListener('error', fallback);
    img.addEventListener('load', () => {
        if (isPlaceholder(img)) {
            fallback();
            return;
        }
        plate.classList.add('is-loaded');
    });
    img.src = url;
    plate.appendChild(img);
    return plate;
}
