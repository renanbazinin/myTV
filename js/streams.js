// streams.js - Resolve the playable URL for a channel
// Most channels play their playlist URL directly. A few (i24News) need a
// short-lived URL fetched at tune time, and some need browser-specific tweaks.

const I24NEWS_CONFIG = {
    BASE_URL: 'https://api.i24news.wiztivi.io',
    USERNAME: 'I24News',
    HARDWARE_ID_TYPE: 'browser'
};

// Hebrew: wiztivi/Brightcove was serving a dead 27s VOD (#EXT-X-ENDLIST).
// Use our live-edge proxy of the immergo CDN instead (fetcher-token service).
const I24_HEBREW_LIVE_URL = 'https://fetcher-token-902812087252.me-west1.run.app/i24-live/he';

const i24newsToken = {
    accessToken: null,
    expiresAt: 0
};

function fetchJson(url, headers) {
    return fetch(url, { method: 'GET', headers }).then((response) => {
        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}`);
        }
        return response.json();
    });
}

/**
 * Get an i24News API token (AWS Cognito via their API), cached for 9 hours
 * @returns {Promise<string>}
 */
function getI24NewsToken() {
    if (i24newsToken.accessToken && Date.now() < i24newsToken.expiresAt) {
        return Promise.resolve(i24newsToken.accessToken);
    }

    const hardwareId = new Date().toISOString();
    const authUrl = `${I24NEWS_CONFIG.BASE_URL}/authenticate?userName=${I24NEWS_CONFIG.USERNAME}`
        + `&hardwareId=${encodeURIComponent(hardwareId)}&hardwareIdType=${I24NEWS_CONFIG.HARDWARE_ID_TYPE}`;

    return fetchJson(authUrl, { Accept: 'application/json' }).then((data) => {
        i24newsToken.accessToken = data.accessToken;
        // JWT expires in ~10 hours; refresh a little earlier
        i24newsToken.expiresAt = Date.now() + (9 * 60 * 60 * 1000);
        return data.accessToken;
    });
}

/**
 * Live HLS URL for an i24News language feed ('en', 'fr', 'ar')
 * @param {string} language
 * @returns {Promise<string|null>}
 */
function getI24NewsStreamUrl(language) {
    return getI24NewsToken()
        .then((token) => fetchJson(`${I24NEWS_CONFIG.BASE_URL}/contents/brightcove/channels/${language}`, {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json'
        }))
        .then((data) => {
            if (data.url) return data.url;
            if (data.hlsUrl) return data.hlsUrl;
            if (data.streamUrl) return data.streamUrl;
            if (Array.isArray(data.sources)) {
                const source = data.sources.filter((item) => item && (
                    item.type === 'application/x-mpegURL' || (item.src && item.src.indexOf('.m3u8') !== -1)
                ))[0];
                if (source) return source.src;
            }
            return null;
        });
}

const RESOLVERS = {
    'i24-il': () => Promise.resolve(I24_HEBREW_LIVE_URL),
    'i24-en': () => getI24NewsStreamUrl('en'),
    'i24-fr': () => getI24NewsStreamUrl('fr'),
    'i24-ar': () => getI24NewsStreamUrl('ar')
};

// Firefox cannot decode the HEVC renditions of these feeds; ask for H.264
const FIREFOX_AVC_CHANNELS = ['12-kanal-il', '13-kanal-il'];

const isFirefox = typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent || '');

/**
 * `.../keshet_12_hevc/live.livx/playlist.m3u8?fmp4&renditions&dvr=...`
 *   -> `.../keshet_12/live.livx/playlist.m3u8?renditions&dvr=...`
 * @param {string} url
 */
export function toAvcUrl(url) {
    return url.replace(/_hevc/g, '').replace(/([?&])fmp4(&|$)/, (_match, sep, tail) => (tail ? sep : ''));
}

/**
 * Whether a channel needs a tune-time URL lookup
 * @param {Object} channel
 */
export function needsResolver(channel) {
    return !!channel && Object.prototype.hasOwnProperty.call(RESOLVERS, channel.id);
}

/**
 * Resolve the URL to hand to the player
 * @param {Object} channel
 * @returns {Promise<string>}
 */
export function resolveStreamUrl(channel) {
    if (needsResolver(channel)) {
        return RESOLVERS[channel.id]()
            .catch((error) => {
                console.error(`[streams] Resolver failed for ${channel.id}:`, error);
                return null;
            })
            .then((url) => {
                if (!url) {
                    throw new Error(`Couldn't get a stream for ${channel.name}`);
                }
                return url;
            });
    }

    const url = isFirefox && FIREFOX_AVC_CHANNELS.indexOf(channel.id) !== -1 ? toAvcUrl(channel.url) : channel.url;
    return Promise.resolve(url);
}
