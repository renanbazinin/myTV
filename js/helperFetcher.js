// helperFetcher.js - Dynamic stream URL fetcher for special channels
// This module handles fetching live stream URLs for channels that require special handling (e.g., i24News)

/**
 * CORS Proxy Configuration
 * Used when running from file:// or localhost to bypass CORS restrictions
 */
const CORS_PROXY = 'https://corsproxy.io/?';

/**
 * Check if we need to use a CORS proxy (running locally)
 */
function needsCorsProxy() {
    const origin = window.location.origin;
    return origin === 'null' || origin.startsWith('file://') || origin.includes('localhost') || origin.includes('127.0.0.1');
}

/**
 * Wrap URL with CORS proxy if needed
 */
function proxyUrl(url) {
    if (needsCorsProxy()) {
        console.log('[HelperFetcher] Using CORS proxy for:', url);
        return CORS_PROXY + encodeURIComponent(url);
    }
    return url;
}

/**
 * i24News API Configuration
 */
const I24NEWS_CONFIG = {
    BASE_URL: 'https://api.i24news.wiztivi.io',
    USERNAME: 'I24News',
    HARDWARE_ID_TYPE: 'browser'
};

/**
 * Cache for the authentication token
 */
let i24newsToken = {
    accessToken: null,
    refreshToken: null,
    expiresAt: null
};

/**
 * Generate a unique hardware ID for authentication
 * @returns {string} A unique hardware ID
 */
function generateHardwareId() {
    return new Date().toISOString();
}

/**
 * Authenticate with the i24News API
 * This fetches an access token from AWS Cognito via their API
 * 
 * @returns {Promise<{accessToken: string, refreshToken: string}>}
 */
async function authenticateI24News() {
    const hardwareId = generateHardwareId();
    const authUrl = `${I24NEWS_CONFIG.BASE_URL}/authenticate?userName=${I24NEWS_CONFIG.USERNAME}&hardwareId=${encodeURIComponent(hardwareId)}&hardwareIdType=${I24NEWS_CONFIG.HARDWARE_ID_TYPE}`;

    try {
        const response = await fetch(proxyUrl(authUrl), {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Cache the token with expiration (JWT typically expires in ~10 hours based on the 'exp' claim)
        i24newsToken.accessToken = data.accessToken;
        i24newsToken.refreshToken = data.refreshToken;
        // Set expiration 9 hours from now (conservative estimate)
        i24newsToken.expiresAt = Date.now() + (9 * 60 * 60 * 1000);

        console.log('[i24News] Authentication successful');
        return data;
    } catch (error) {
        console.error('[i24News] Authentication error:', error);
        throw error;
    }
}

/**
 * Get a valid access token, refreshing if necessary
 * @returns {Promise<string>} Valid access token
 */
async function getI24NewsToken() {
    // Check if we have a valid cached token
    if (i24newsToken.accessToken && i24newsToken.expiresAt && Date.now() < i24newsToken.expiresAt) {
        return i24newsToken.accessToken;
    }

    // Need to get a new token
    const authData = await authenticateI24News();
    return authData.accessToken;
}

/**
 * Fetch channel data from i24News API
 * @param {string} language - Language code: 'he' (Hebrew), 'en' (English), 'fr' (French), 'ar' (Arabic)
 * @returns {Promise<Object>} Channel data including stream URLs
 */
async function getI24NewsChannel(language = 'he') {
    const token = await getI24NewsToken();
    const url = `${I24NEWS_CONFIG.BASE_URL}/contents/brightcove/channels/${language}`;

    try {
        const response = await fetch(proxyUrl(url), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch channel: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`[i24News] Channel data for ${language}:`, data);
        return data;
    } catch (error) {
        console.error(`[i24News] Error fetching channel ${language}:`, error);
        throw error;
    }
}

/**
 * Get the live stream URL for an i24News channel
 * 
 * API Response structure:
 * {
 *   "id": "he",
 *   "name": "HE", 
 *   "number": 2,
 *   "provider": "brightcove",
 *   "url": "https://fastly.live.brightcove.com/.../playlist-hls.m3u8?...",
 *   "images": [{ "url": "...", "width": 3840, "height": 2160, "type": "16/9" }]
 * }
 * 
 * @param {string} language - Language code
 * @returns {Promise<string|null>} HLS stream URL or null if not found
 */
async function getI24NewsStreamUrl(language = 'he') {
    try {
        const channelData = await getI24NewsChannel(language);

        // The stream URL is directly in the 'url' property (Brightcove HLS playlist)
        if (channelData.url) {
            console.log(`[i24News] Found stream URL for ${language}`);
            return channelData.url;
        }

        // Fallback: check alternative property names
        if (channelData.hlsUrl) return channelData.hlsUrl;
        if (channelData.streamUrl) return channelData.streamUrl;

        // Fallback: check sources array (alternative API structure)
        if (channelData.sources) {
            const hlsSource = channelData.sources.find(s =>
                s.type === 'application/x-mpegURL' ||
                s.src?.includes('.m3u8')
            );
            if (hlsSource) {
                return hlsSource.src;
            }
        }

        // If none found, log for debugging
        console.log('[i24News] Full channel response:', JSON.stringify(channelData, null, 2));
        return null;
    } catch (error) {
        console.error('[i24News] Error getting stream URL:', error);
        return null;
    }
}


/**
 * Add i24News channels to the channel list
 * @returns {Promise<Array>} Array of channel objects for i24News
 */
async function getI24NewsChannels() {
    const languages = [
        { code: 'he', name: 'i24News Hebrew', logo: 'https://video.i24news.tv/favicon.png' },
        { code: 'en', name: 'i24News English', logo: 'https://video.i24news.tv/favicon.png' },
        { code: 'fr', name: 'i24News French', logo: 'https://video.i24news.tv/favicon.png' },
        { code: 'ar', name: 'i24News Arabic', logo: 'https://video.i24news.tv/favicon.png' }
    ];

    const channels = [];

    for (const lang of languages) {
        try {
            const streamUrl = await getI24NewsStreamUrl(lang.code);
            if (streamUrl) {
                channels.push({
                    name: lang.name,
                    logo: lang.logo,
                    url: streamUrl,
                    groupTitle: 'Israel',
                    source: 'i24news'
                });
            }
        } catch (error) {
            console.error(`[i24News] Failed to get ${lang.name} channel:`, error);
        }
    }

    return channels;
}

/**
 * Play i24News channel directly
 * @param {string} language - Language code
 */
async function playI24NewsChannel(language = 'he') {
    try {
        const streamUrl = await getI24NewsStreamUrl(language);
        if (streamUrl) {
            // Use the playStream function from hls-player.js
            if (typeof playStream === 'function') {
                playStream(streamUrl);
            } else {
                console.error('[i24News] playStream function not available');
            }
        } else {
            console.error('[i24News] No stream URL found for language:', language);
        }
    } catch (error) {
        console.error('[i24News] Error playing channel:', error);
    }
}

/**
 * Main helper function to fetch stream URL for special channels
 * This is the main entry point called from channels.js
 * 
 * @param {string} channelId - The tvg-id of the channel (e.g., 'i24-il')
 * @returns {Promise<string|null>} Stream URL or null if not supported/failed
 */
async function fetchStreamUrl(channelId) {
    console.log(`[HelperFetcher] Fetching stream for channel: ${channelId}`);

    // Map channel IDs to their respective fetchers
    const channelFetchers = {
        'i24-il': () => getI24NewsStreamUrl('he'),      // Hebrew
        'i24-en': () => getI24NewsStreamUrl('en'),      // English  
        'i24-fr': () => getI24NewsStreamUrl('fr'),      // French
        'i24-ar': () => getI24NewsStreamUrl('ar'),      // Arabic
    };

    const fetcher = channelFetchers[channelId];

    if (!fetcher) {
        console.log(`[HelperFetcher] No fetcher found for channel: ${channelId}`);
        return null;
    }

    try {
        const streamUrl = await fetcher();
        console.log(`[HelperFetcher] Got stream URL for ${channelId}:`, streamUrl ? 'success' : 'null');
        return streamUrl;
    } catch (error) {
        console.error(`[HelperFetcher] Error fetching ${channelId}:`, error);
        return null;
    }
}

/**
 * Check if a channel ID requires special handling
 * @param {string} channelId - The tvg-id of the channel
 * @returns {boolean} True if the channel needs special fetching
 */
function needsHelperFetcher(channelId) {
    const specialChannels = ['i24-il', 'i24-en', 'i24-fr', 'i24-ar'];
    return specialChannels.includes(channelId);
}

// Export for module usage (if using modules in the future)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        fetchStreamUrl,
        needsHelperFetcher,
        getI24NewsStreamUrl,
        playI24NewsChannel
    };
}

