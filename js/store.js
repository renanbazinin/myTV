// store.js - App state, persistence and a tiny event bus for myTV

import { STORAGE_KEYS, DEFAULT_VOLUME } from './config.js';

const listeners = {};

/**
 * Subscribe to an app event
 * @param {string} event
 * @param {Function} fn
 * @returns {Function} unsubscribe
 */
export function on(event, fn) {
    (listeners[event] = listeners[event] || []).push(fn);
    return () => {
        listeners[event] = (listeners[event] || []).filter((item) => item !== fn);
    };
}

/**
 * Emit an app event
 * @param {string} event
 * @param {*} [payload]
 */
export function emit(event, payload) {
    (listeners[event] || []).slice().forEach((fn) => {
        try {
            fn(payload);
        } catch (error) {
            console.error(`[store] listener for "${event}" failed:`, error);
        }
    });
}

// Storage can throw (private mode, disabled storage on some TV browsers)
export function readStorage(key, fallback) {
    try {
        const value = window.localStorage.getItem(key);
        return value === null ? fallback : value;
    } catch (_error) {
        return fallback;
    }
}

export function writeStorage(key, value) {
    try {
        if (value === null || value === undefined) {
            window.localStorage.removeItem(key);
        } else {
            window.localStorage.setItem(key, String(value));
        }
    } catch (_error) {
        // Ignore quota / private mode failures
    }
}

function readJson(key, fallback) {
    try {
        const raw = readStorage(key, null);
        return raw ? JSON.parse(raw) : fallback;
    } catch (_error) {
        return fallback;
    }
}

function readVolume() {
    const value = parseFloat(readStorage(STORAGE_KEYS.volume, String(DEFAULT_VOLUME)));
    return value >= 0 && value <= 1 ? value : DEFAULT_VOLUME;
}

export const state = {
    // Playlist
    channels: [],
    categories: [],

    // Browse
    category: readStorage(STORAGE_KEYS.category, 'all') || 'all',
    query: '',

    // Playback
    current: null,
    previous: null,
    zapList: [],

    // Preferences
    volume: readVolume(),
    muted: readStorage(STORAGE_KEYS.muted, 'false') === 'true',
    favorites: readJson(STORAGE_KEYS.favorites, []),
    lastChannelKey: readStorage(STORAGE_KEYS.lastChannel, null),
    layout: readStorage(STORAGE_KEYS.layout, 'auto'),
    autoplayLast: readStorage(STORAGE_KEYS.autoplayLast, 'false') === 'true',
    reverseZap: readStorage(STORAGE_KEYS.reverseZap, 'false') === 'true',
    // '' = off, otherwise the preferred language ('en') or 'on' for any
    captions: readStorage(STORAGE_KEYS.captions, '') || ''
};

if (!Array.isArray(state.favorites)) {
    state.favorites = [];
}
if (['auto', 'tv', 'standard'].indexOf(state.layout) === -1) {
    state.layout = 'auto';
}

let volumeTimer = null;

/**
 * Persist volume / mute (debounced while a slider is dragged)
 */
export function persistVolume() {
    clearTimeout(volumeTimer);
    volumeTimer = setTimeout(() => {
        writeStorage(STORAGE_KEYS.volume, state.volume);
        writeStorage(STORAGE_KEYS.muted, state.muted);
    }, 180);
}

/**
 * Find a channel by stable key; falls back to a unique tvg-id match so
 * favorites survive a channel being renamed in the playlist.
 * @param {string|null} key
 */
export function findChannelByKey(key) {
    if (!key) return null;
    let match = null;
    state.channels.some((channel) => {
        if (channel.key === key) match = channel;
        return !!match;
    });
    if (match) return match;

    const id = String(key).split('|')[0];
    if (!id || id === '_') return null;
    const sameId = state.channels.filter((channel) => channel.id === id);
    return sameId.length === 1 ? sameId[0] : null;
}

export function findChannelByNumber(number) {
    return state.channels.filter((channel) => channel.number === number)[0] || null;
}

export function isFavorite(channel) {
    return !!channel && state.favorites.indexOf(channel.key) !== -1;
}

/**
 * Toggle a channel in favorites
 * @param {Object} channel
 * @returns {boolean} new favorite state
 */
export function toggleFavorite(channel) {
    if (!channel) return false;
    const index = state.favorites.indexOf(channel.key);
    if (index === -1) {
        state.favorites.push(channel.key);
    } else {
        state.favorites.splice(index, 1);
    }
    writeStorage(STORAGE_KEYS.favorites, JSON.stringify(state.favorites));
    const active = index === -1;
    emit('favorites', { channel, active });
    return active;
}

/**
 * Favorites in playlist order. Keys saved before a playlist rename are
 * remapped through findChannelByKey.
 */
export function favoriteChannels() {
    const picked = [];
    state.favorites.forEach((key) => {
        const channel = findChannelByKey(key);
        if (channel && picked.indexOf(channel) === -1) picked.push(channel);
    });
    return picked.sort((a, b) => a.number - b.number);
}

/**
 * Re-key saved favorites / last channel after the playlist changed
 */
export function remapSavedKeys() {
    const remapped = [];
    state.favorites.forEach((key) => {
        const channel = findChannelByKey(key);
        const next = channel ? channel.key : key;
        if (remapped.indexOf(next) === -1) remapped.push(next);
    });
    if (remapped.join('\n') !== state.favorites.join('\n')) {
        state.favorites = remapped;
        writeStorage(STORAGE_KEYS.favorites, JSON.stringify(remapped));
    }
    const last = findChannelByKey(state.lastChannelKey);
    if (last && last.key !== state.lastChannelKey) {
        setLastChannel(last);
    }
}

export function setLastChannel(channel) {
    state.lastChannelKey = channel ? channel.key : null;
    writeStorage(STORAGE_KEYS.lastChannel, state.lastChannelKey);
}

export function lastChannel() {
    return findChannelByKey(state.lastChannelKey);
}

export function setCategory(id) {
    state.category = id;
    writeStorage(STORAGE_KEYS.category, id);
}

export function setLayoutPreference(value) {
    state.layout = value;
    writeStorage(STORAGE_KEYS.layout, value);
    emit('layout', value);
}

export function setAutoplayLast(value) {
    state.autoplayLast = !!value;
    writeStorage(STORAGE_KEYS.autoplayLast, state.autoplayLast);
}

export function setReverseZap(value) {
    state.reverseZap = !!value;
    writeStorage(STORAGE_KEYS.reverseZap, state.reverseZap);
}

/**
 * Captions for every channel: '' = off, a language ('en') or 'on' for any
 * @param {string} value
 */
export function setCaptionsPreference(value) {
    const next = value ? String(value) : '';
    if (next === state.captions) return;
    state.captions = next;
    writeStorage(STORAGE_KEYS.captions, next);
    emit('captions-pref', next);
}
