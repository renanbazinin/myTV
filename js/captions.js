// captions.js - Closed captions and subtitles for the playing stream
//
// hls.js hands its cues over (renderTextTracksNatively: false) instead of
// adding TextTracks to the <video>: those can never be removed, so on the one
// persistent element they would pile up channel after channel. Native HLS
// (Safari, iPhone) exposes the stream's own tracks in video.textTracks, which
// the browser replaces with each source; they are read in 'hidden' mode.
// Either way the UI draws the text (watch.js), except in iPhone native
// fullscreen and Safari picture-in-picture, where only the system can.
//
// Events: player:captions (tracks or selection changed)
//         player:caption-text {text, top}

import { state, emit, on, setCaptionsPreference } from './store.js';

const LANGUAGE_NAMES = {
    en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
    pt: 'Portuguese', ru: 'Russian', ar: 'Arabic', he: 'Hebrew'
};

// ISO 639-2 codes some manifests use
const THREE_LETTER = {
    eng: 'en', spa: 'es', fra: 'fr', fre: 'fr', deu: 'de', ger: 'de', ita: 'it',
    por: 'pt', rus: 'ru', ara: 'ar', heb: 'he', iw: 'he'
};

// Cues further than this behind the playhead are dropped (seconds)
const KEEP_BEHIND = 60;
const MAX_CUES = 1500;
const MAX_LINES = 4;

let video = null;
let engine = null; // 'hlsjs' | 'native' | null
let hls = null;
let tracks = []; // {id, kind, label, lang, cueKey?, hlsIndex?, textTrack?}
let selected = null;
let cues = {}; // cueKey -> [{id, start, end, line, text}]
let shownText = '';
let shownTop = false;
let lastPrune = 0;
let nativeSeq = 0;

/* ---------- Helpers (pure, unit-tested) ---------- */

/**
 * 'eng' / 'en-US' / 'EN' -> 'en'
 * @param {string} code
 */
export function normalizeLanguage(code) {
    const base = String(code || '').trim().toLowerCase().split(/[-_]/)[0];
    return THREE_LETTER[base] || base;
}

/**
 * A readable track name. Manifest names are sometimes internal IDs
 * ("Source-USPhx-16k-1_SPLIT_1_sub") or channel numbers ("CC1"): fall back
 * to the language.
 * @param {string} name
 * @param {string} lang
 * @param {string} kind - 'captions' | 'subtitles'
 */
export function trackLabel(name, lang, kind) {
    const clean = String(name || '').replace(/\s+/g, ' ').trim();
    if (clean && clean.length <= 24 && !/[_\/\\]|\d{3,}/.test(clean) && !/^(cc|service)\s*\d$/i.test(clean)) {
        return clean.charAt(0).toUpperCase() + clean.slice(1);
    }
    const code = normalizeLanguage(lang);
    if (LANGUAGE_NAMES[code]) return LANGUAGE_NAMES[code];
    if (code) return code.toUpperCase();
    return kind === 'subtitles' ? 'Subtitles' : 'Captions';
}

/**
 * Plain text of a cue: WebVTT tags and entities removed, spacing tidied
 * @param {string} text
 */
export function cleanCueText(text) {
    return String(text || '')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lrm;|&rlm;/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .split(/\r?\n/)
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean)
        .join('\n');
}

/**
 * Join cues into the lines on screen: top row first (CEA-608 rows), at most
 * a few lines
 * @param {Array<{start: number, line: number, text: string}>} list
 */
export function joinCues(list) {
    const lines = [];
    list.slice()
        .sort((a, b) => (a.line - b.line) || (a.start - b.start))
        .forEach((cue) => {
            cleanCueText(cue.text).split('\n').forEach((line) => {
                if (line && lines.indexOf(line) === -1) lines.push(line);
            });
        });
    return lines.slice(-MAX_LINES).join('\n');
}

/**
 * Cues showing at `time`
 * @param {Array<{start: number, end: number}>} list
 * @param {number} time
 */
export function activeAt(list, time) {
    return list.filter((cue) => cue.start <= time && time < cue.end);
}

/**
 * The caption text showing at `time`
 * @param {Array<{start: number, end: number, line: number, text: string}>} list
 * @param {number} time
 */
export function textAt(list, time) {
    return joinCues(activeAt(list, time));
}

/**
 * Captions placed in the top rows (broadcasters move CEA-608 captions up to
 * clear their own headline bars) are drawn at the top too
 * @param {Array<{line: number}>} list - active cues
 */
export function atTop(list) {
    return list.length > 0 && list.every((cue) => cue.line >= 1 && cue.line <= 7);
}

function toEntry(cue) {
    return {
        id: cue.id || '',
        start: cue.startTime,
        end: cue.endTime,
        line: typeof cue.line === 'number' ? cue.line : 0,
        text: typeof cue.text === 'string'
            ? cue.text
            : (typeof cue.getCueAsHTML === 'function' ? cue.getCueAsHTML().textContent : '')
    };
}

/* ---------- Tracks ---------- */

function findTrack(id) {
    if (id === null) return null;
    return tracks.filter((track) => track.id === id)[0] || null;
}

function publicTrack(track) {
    if (!track) return null;
    // Two "English" tracks: say which is which
    const twin = tracks.some((other) => other !== track && other.label === track.label);
    const label = twin ? track.label + (track.kind === 'captions' ? ' (CC)' : ' (subtitles)') : track.label;
    return { id: track.id, kind: track.kind, label, lang: normalizeLanguage(track.lang) };
}

/**
 * Caption / subtitle tracks of the playing stream
 * @returns {Array<{id: string, kind: string, label: string, lang: string}>}
 */
export function captionTracks() {
    return tracks.map(publicTrack);
}

export function selectedCaptionTrack() {
    return publicTrack(findTrack(selected));
}

/** Safari draws captions itself in iPhone fullscreen and picture-in-picture */
function systemDraws() {
    if (engine !== 'native' || !video) return false;
    return !!video.webkitDisplayingFullscreen
        || video.webkitPresentationMode === 'picture-in-picture'
        || (typeof document !== 'undefined' && document.pictureInPictureElement === video);
}

function applySelection() {
    const track = findTrack(selected);
    if (engine === 'hlsjs' && hls) {
        // Subtitle renditions only download while selected
        const index = track && typeof track.hlsIndex === 'number' ? track.hlsIndex : -1;
        try {
            if (hls.subtitleTrack !== index) hls.subtitleTrack = index;
        } catch (_error) { /* destroyed */ }
    } else if (engine === 'native') {
        const system = systemDraws();
        tracks.forEach((item) => {
            const mode = item === track ? (system ? 'showing' : 'hidden') : 'disabled';
            try {
                if (item.textTrack.mode !== mode) item.textTrack.mode = mode;
            } catch (_error) { /* track gone */ }
        });
    }
    render();
}

/**
 * Follow the saved preference: off, the preferred language, or any track.
 * A track picked because nothing matched gives way when a match turns up.
 */
function autoSelect() {
    const pref = state.captions;
    if (!pref || !tracks.length) {
        selected = null;
        return;
    }
    const current = findTrack(selected);
    const exact = pref === 'on' ? null : tracks.filter((track) => normalizeLanguage(track.lang) === pref)[0];
    if (current && (!exact || normalizeLanguage(current.lang) === pref)) return;
    selected = (exact || tracks[0]).id;
}

function tracksChanged() {
    autoSelect();
    applySelection();
    emit('player:captions');
}

/**
 * Pick a track (or null for off) and remember the choice for other channels
 * @param {string|null} id
 */
export function selectCaptionTrack(id) {
    const track = findTrack(id);
    selected = track ? track.id : null;
    applySelection();
    emit('player:captions');
    setCaptionsPreference(track ? (normalizeLanguage(track.lang) || 'on') : '');
}

/**
 * Off -> first track -> next track ... -> off
 * @returns {Object|null} the track now showing
 */
export function cycleCaptions() {
    if (!tracks.length) return null;
    const index = tracks.indexOf(findTrack(selected));
    const next = index + 1 < tracks.length ? tracks[index + 1] : null;
    selectCaptionTrack(next ? next.id : null);
    return publicTrack(next);
}

/* ---------- Cues ---------- */

function addCues(key, list) {
    if (!key || !list || !list.length) return;
    const stored = cues[key] || (cues[key] = []);
    for (let i = 0; i < list.length; i++) {
        const entry = toEntry(list[i]);
        if (entry.id && stored.some((item) => item.id === entry.id)) continue;
        stored.push(entry);
    }
    if (stored.length > MAX_CUES) stored.splice(0, stored.length - MAX_CUES);
    render();
}

function prune(time) {
    Object.keys(cues).forEach((key) => {
        cues[key] = cues[key].filter((cue) => cue.end >= time - KEEP_BEHIND);
    });
}

function render() {
    let active = [];
    const track = findTrack(selected);
    if (track && video && !systemDraws()) {
        if (engine === 'native') {
            const list = track.textTrack.activeCues;
            active = list ? Array.prototype.map.call(list, toEntry) : [];
        } else if (track.cueKey) {
            active = activeAt(cues[track.cueKey] || [], video.currentTime);
        }
    }
    const text = joinCues(active);
    const top = !!text && atTop(active);
    if (text !== shownText || top !== shownTop) {
        shownText = text;
        shownTop = top;
        emit('player:caption-text', { text, top });
    }
}

function onTime() {
    if (!engine) return;
    const now = Date.now();
    if (now - lastPrune > 10000) {
        lastPrune = now;
        prune(video.currentTime);
    }
    render();
}

/* ---------- hls.js ---------- */

function captionLanguage(instance, found) {
    if (found.closedCaptions && found.closedCaptions.lang) return found.closedCaptions.lang;
    // 'textTrack1' -> config.captionsTextTrack1LanguageCode
    const id = String(found._id || '');
    return instance.config['captions' + id.charAt(0).toUpperCase() + id.slice(1) + 'LanguageCode'] || '';
}

/**
 * Collect the tracks and cues of a new hls.js instance
 * @param {Hls} instance
 */
export function bindHls(instance) {
    const Events = window.Hls.Events;
    engine = 'hlsjs';
    hls = instance;

    instance.on(Events.NON_NATIVE_TEXT_TRACKS_FOUND, (_event, data) => {
        if (hls !== instance || !data || !data.tracks) return;
        data.tracks.forEach((found) => {
            if (found.subtitleTrack) {
                // A subtitle rendition (the whole list arrives at once)
                let index = (instance.subtitleTracks || []).indexOf(found.subtitleTrack);
                if (index === -1) index = found.subtitleTrack.id;
                const id = 'sub' + index;
                tracks = tracks.filter((track) => track.id !== id);
                tracks.push({
                    id,
                    kind: 'subtitles',
                    label: trackLabel(found.label, found.subtitleTrack.lang, 'subtitles'),
                    lang: found.subtitleTrack.lang || '',
                    hlsIndex: index,
                    // hls.js tags the cues of rendition N like this
                    cueKey: found.default ? 'default' : 'subtitles' + index
                });
            } else if (found._id && !findTrack(found._id)) {
                // CEA-608 captions inside the video (CC1-CC4)
                const lang = captionLanguage(instance, found);
                tracks.push({
                    id: found._id,
                    kind: 'captions',
                    label: trackLabel(found.label, lang, 'captions'),
                    lang,
                    cueKey: found._id
                });
            }
        });
        // In-video captions first: they follow the picture exactly
        tracks.sort((a, b) => (a.kind === b.kind ? 0 : (a.kind === 'captions' ? -1 : 1)));
        tracksChanged();
    });

    instance.on(Events.CUES_PARSED, (_event, data) => {
        if (hls === instance && data) addCues(data.track, data.cues);
    });

    // hls.js may pick a default subtitle rendition on its own
    instance.on(Events.SUBTITLE_TRACK_SWITCH, () => {
        if (hls === instance) applySelection();
    });
}

/* ---------- Native HLS ---------- */

function syncNativeTracks() {
    if (engine !== 'native' || !video || !video.textTracks) return;
    const list = [];
    for (let i = 0; i < video.textTracks.length; i++) {
        const textTrack = video.textTracks[i];
        if (textTrack.kind !== 'captions' && textTrack.kind !== 'subtitles') continue;
        let entry = tracks.filter((track) => track.textTrack === textTrack)[0];
        if (!entry) {
            nativeSeq += 1;
            entry = {
                id: 'native' + nativeSeq,
                kind: textTrack.kind,
                label: trackLabel(textTrack.label, textTrack.language, textTrack.kind),
                lang: textTrack.language || '',
                textTrack
            };
        }
        list.push(entry);
    }
    tracks = list;
    tracksChanged();
}

/**
 * The stream plays through native HLS: its tracks are on the <video>
 */
export function useNativeTracks() {
    engine = 'native';
    hls = null;
    syncNativeTracks();
}

/**
 * Leaving iPhone fullscreen / picture-in-picture hands drawing back to us.
 * A choice made in the system captions menu meanwhile is kept.
 * @param {boolean} fullscreenEnded
 */
function onSystemPresentation(fullscreenEnded) {
    if (engine !== 'native') return;
    if (fullscreenEnded) {
        const showing = tracks.filter((track) => track.textTrack.mode === 'showing')[0] || null;
        if (showing !== findTrack(selected)) {
            selectCaptionTrack(showing ? showing.id : null);
            return;
        }
    }
    applySelection();
}

/* ---------- Setup ---------- */

/**
 * Forget the stream's tracks and cues (called on every teardown)
 */
export function resetCaptions() {
    engine = null;
    hls = null;
    tracks = [];
    cues = {};
    selected = null;
    if (shownText) {
        shownText = '';
        shownTop = false;
        emit('player:caption-text', { text: '', top: false });
    }
    emit('player:captions');
}

/**
 * @param {HTMLVideoElement} videoElement - the player's persistent <video>
 */
export function attachCaptions(videoElement) {
    video = videoElement;
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('seeked', render);

    const list = video.textTracks;
    if (list && typeof list.addEventListener === 'function') {
        list.addEventListener('addtrack', syncNativeTracks);
        list.addEventListener('removetrack', syncNativeTracks);
    }
    video.addEventListener('webkitbeginfullscreen', () => onSystemPresentation(false));
    video.addEventListener('webkitendfullscreen', () => onSystemPresentation(true));
    video.addEventListener('webkitpresentationmodechanged', () => onSystemPresentation(false));
    video.addEventListener('enterpictureinpicture', () => onSystemPresentation(false));
    video.addEventListener('leavepictureinpicture', () => onSystemPresentation(false));

    // Turned on or off in Settings
    on('captions-pref', () => {
        if (!engine) return;
        tracksChanged();
    });
}
