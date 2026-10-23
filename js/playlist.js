// playlist.js - Fetch, parse and cache the M3U channel list

import { M3U_URL, STORAGE_KEYS } from './config.js';
import { readStorage, writeStorage } from './store.js';

/**
 * Split an #EXTINF line into its attribute part and display title. The title
 * starts after the first comma that is not inside quotes, e.g.
 * `#EXTINF:-1 tvg-id="x" group-title="News" ,Fox Live` -> "Fox Live"
 * @param {string} line
 */
function splitExtinf(line) {
    const body = line.slice(line.indexOf(':') + 1);
    let quoted = false;
    for (let i = 0; i < body.length; i += 1) {
        const ch = body.charAt(i);
        if (ch === '"') {
            quoted = !quoted;
        } else if (ch === ',' && !quoted) {
            return { attrs: body.slice(0, i), title: body.slice(i + 1).trim() };
        }
    }
    return { attrs: body, title: '' };
}

/**
 * Read `key="value"` attributes
 * @param {string} text
 * @returns {Object}
 */
function parseAttributes(text) {
    const attrs = {};
    const pattern = /([A-Za-z0-9_-]+)="([^"]*)"/g;
    let match = pattern.exec(text);
    while (match) {
        attrs[match[1].toLowerCase()] = match[2].trim();
        match = pattern.exec(text);
    }
    return attrs;
}

/**
 * Title-case all-lowercase titles ("kan 11" -> "Kan 11") but leave words with
 * digits ("i24") and already-cased titles alone.
 * @param {string} title
 */
export function prettifyTitle(title) {
    const clean = String(title || '').replace(/\s+/g, ' ').trim();
    if (!clean || clean !== clean.toLowerCase()) return clean;
    return clean.split(' ').map((word) => {
        if (/\d/.test(word) || !/^[a-z]/.test(word)) return word;
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
}

/**
 * "TvShowMarathons" -> "TV Show Marathons", "WeatherSki" -> "Weather Ski"
 * @param {string} group
 */
export function prettifyGroup(group) {
    const clean = String(group || '').trim();
    if (!clean) return 'Other';
    return clean
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_]+/g, ' ')
        .replace(/\bTv\b/g, 'TV')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Two-letter monogram used when a logo is missing or fails to load
 * @param {string} name
 */
export function monogram(name) {
    const words = String(name || '?').replace(/[^A-Za-z0-9\s]/g, ' ').trim().split(/\s+/);
    if (words.length > 1 && words[0] && words[1]) {
        return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
    }
    return String(words[0] || '?').slice(0, 2).toUpperCase();
}

/**
 * Parse M3U playlist text into channel objects
 * @param {string} text
 * @returns {Array<{index:number, number:number, id:string, name:string, logo:string,
 *   group:string, groupLabel:string, url:string, key:string}>}
 */
export function parsePlaylist(text) {
    const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/);
    const channels = [];
    const seenKeys = {};
    let pending = null;

    lines.forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line) return;

        if (line.indexOf('#EXTINF') === 0) {
            const parts = splitExtinf(line);
            const attrs = parseAttributes(parts.attrs);
            pending = {
                id: attrs['tvg-id'] || '',
                rawTitle: parts.title || attrs['tvg-name'] || attrs['tvg-id'] || '',
                logo: attrs['tvg-logo'] || '',
                group: attrs['group-title'] || ''
            };
            return;
        }

        if (line.indexOf('#EXTGRP:') === 0) {
            if (pending && !pending.group) pending.group = line.slice(8).trim();
            return;
        }

        if (line.charAt(0) === '#') return;

        if (pending && (pending.rawTitle || pending.id)) {
            // Favorites / last channel are keyed by id + title: stable when the
            // playlist is reordered or a stream URL is swapped (tvg-id alone is
            // not unique).
            const normalizedTitle = pending.rawTitle.toLowerCase().replace(/\s+/g, ' ').trim();
            let key = (pending.id || '_') + '|' + normalizedTitle;
            if (seenKeys[key]) {
                seenKeys[key] += 1;
                key += '#' + seenKeys[key];
            } else {
                seenKeys[key] = 1;
            }

            const group = pending.group || 'Other';
            const index = channels.length;
            channels.push({
                index,
                number: index + 1,
                id: pending.id,
                name: prettifyTitle(pending.rawTitle || pending.id),
                logo: pending.logo,
                group,
                groupLabel: prettifyGroup(group),
                url: line,
                key
            });
        }
        pending = null;
    });

    return channels;
}

/**
 * Ordered list of categories found in the playlist
 * @param {Array} channels
 * @returns {Array<{id:string, label:string, count:number}>}
 */
export function buildCategories(channels) {
    const order = [];
    const counts = {};
    const labels = {};
    channels.forEach((channel) => {
        if (!counts[channel.group]) {
            order.push(channel.group);
            counts[channel.group] = 0;
            labels[channel.group] = channel.groupLabel;
        }
        counts[channel.group] += 1;
    });
    return order.map((group) => ({ id: group, label: labels[group], count: counts[group] }));
}

/**
 * Last good playlist text (any age — refreshed in the background). The raw
 * text is cached, so parser fixes also apply to cached data.
 * @returns {{text: string, fetchedAt: number}|null}
 */
export function readCachedPlaylist() {
    try {
        const raw = readStorage(STORAGE_KEYS.playlistCache, null);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.text !== 'string' || !parsed.text) return null;
        return parsed;
    } catch (_error) {
        return null;
    }
}

/**
 * Download the playlist text
 * @returns {Promise<string>}
 */
export function fetchPlaylistText() {
    return fetch(M3U_URL, { cache: 'no-cache' })
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Playlist HTTP ${response.status}`);
            }
            return response.text();
        })
        .then((text) => {
            if (!parsePlaylist(text).length) {
                throw new Error('Playlist contained no channels');
            }
            writeStorage(STORAGE_KEYS.playlistCache, JSON.stringify({ text, fetchedAt: Date.now() }));
            return text;
        });
}
