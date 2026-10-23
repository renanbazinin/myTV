// browse.js - Channel guide: category tabs, "continue watching", channel
// sections, search

import { h, icon, $, $$, isVisible } from '../dom.js';
import { state, emit, on, isFavorite, toggleFavorite, favoriteChannels, lastChannel, setCategory } from '../store.js';
import { focusElement, focusInitial, focusQuietly, isKeyboardMode, setTopObstruction, pushScope, popScope } from '../nav.js';
import { channelLogo } from './logo.js';
import { showToast } from './overlays.js';
import { isTvMode, isCoarsePointer } from '../device.js';

const FAVORITES = 'favorites';
const ALL = 'all';

let els = {};
let cardCache = {};
let searchOpen = false;
let tabFilterTimer = null;

/* ---------- Filtering ---------- */

function normalize(text) {
    return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function searchResults() {
    const query = normalize(state.query);
    return state.channels.filter((channel) => normalize(channel.name).indexOf(query) !== -1
        || normalize(channel.groupLabel).indexOf(query) !== -1
        || normalize(channel.id).indexOf(query) !== -1
        || String(channel.number) === query);
}

/**
 * Channels for the current tab or search, in zap order
 */
export function visibleChannels() {
    if (state.query) return searchResults();
    if (state.category === FAVORITES) return favoriteChannels();
    if (state.category === ALL) return state.channels;
    return state.channels.filter((channel) => channel.group === state.category);
}

/* ---------- Tabs ---------- */

function renderTabs() {
    const tabs = [{ id: ALL, label: 'All', count: state.channels.length }]
        .concat([{ id: FAVORITES, label: 'Favorites', count: favoriteChannels().length, icon: 'star' }])
        .concat(state.categories);

    const focusedId = document.activeElement && els.tabs.contains(document.activeElement)
        ? document.activeElement.getAttribute('data-category')
        : null;

    els.tabs.textContent = '';
    tabs.forEach((tab) => {
        const selected = tab.id === state.category && !state.query;
        const button = h('button.tab' + (selected ? '.is-active' : ''), {
            type: 'button',
            role: 'tab',
            id: 'tab-' + tab.id.replace(/[^A-Za-z0-9_-]/g, '_'),
            'aria-selected': selected ? 'true' : 'false',
            'aria-controls': 'sections',
            tabindex: selected || (!state.query ? false : tab.id === ALL) ? '0' : '-1',
            'data-category': tab.id,
            'data-nav': true,
            onclick: () => selectCategory(tab.id, true)
        }, [
            tab.icon ? icon(tab.icon, 'tab-icon') : null,
            h('span.tab-label', { text: tab.label }),
            h('span.tab-count', { 'aria-hidden': 'true', text: String(tab.count) }),
            h('span.visually-hidden', { text: `, ${tab.count} channel${tab.count === 1 ? '' : 's'}` })
        ]);
        // TV: focusing a tab shows its channels, no OK press needed (but
        // passing over the tabs must not wipe a search)
        button.addEventListener('focus', () => {
            if (!isTvMode() || !isKeyboardMode() || state.query) return;
            clearTimeout(tabFilterTimer);
            tabFilterTimer = setTimeout(() => {
                if (document.activeElement === button) selectCategory(tab.id, false);
            }, 300);
        });
        els.tabs.appendChild(button);
        if (focusedId === tab.id) focusQuietly(button);
    });
}

function centerActiveTab() {
    const active = $('.tab.is-active', els.tabs);
    if (!active) return;
    els.tabs.scrollLeft = active.offsetLeft - (els.tabs.clientWidth - active.offsetWidth) / 2;
}

/**
 * Switch the visible category
 * @param {string} id
 * @param {boolean} fromClick
 */
export function selectCategory(id, fromClick) {
    if (state.category === id && !state.query) return;
    setCategory(id);
    if (state.query) {
        els.search.value = '';
        state.query = '';
        els.searchClear.hidden = true;
        if (searchOpen && compactSearch()) setSearchOpen(false);
    }
    renderTabs();
    renderSections();
    if (fromClick) centerActiveTab();
    window.scrollTo(0, 0);
}

/* ---------- Continue watching ---------- */

function renderResume() {
    const channel = lastChannel();
    const show = !!channel && state.category === ALL && !state.query;
    els.resume.hidden = !show;
    els.resume.textContent = '';
    if (!show) return;

    els.resume.appendChild(h('button.resume-card', {
        type: 'button',
        'data-nav': true,
        'data-nav-initial': true,
        'data-key': channel.key,
        'aria-label': `Continue watching ${channel.name}, channel ${channel.number}`,
        onclick: () => tune(channel, state.channels)
    }, [
        h('span.resume-plate', null, [channelLogo(channel)]),
        h('span.resume-text', null, [
            h('span.resume-kicker', { text: 'Continue watching' }),
            h('span.resume-name', { text: channel.name }),
            h('span.resume-meta', null, [
                h('span.resume-number', { text: 'CH ' + channel.number }),
                h('span.resume-group', { text: channel.groupLabel })
            ])
        ]),
        h('span.resume-cta', { 'aria-hidden': 'true' }, [icon('play'), h('span', { text: 'Watch' })])
    ]));
}

/* ---------- Cards ---------- */

function cardLabel(channel) {
    return `${channel.number}, ${channel.name}, ${channel.groupLabel}${isFavorite(channel) ? ', favorite' : ''}`;
}

function updateStar(cell, channel) {
    const favorite = isFavorite(channel);
    cell.classList.toggle('is-favorite', favorite);
    const star = $('.card-fav', cell);
    star.classList.toggle('is-on', favorite);
    star.setAttribute('aria-pressed', favorite ? 'true' : 'false');
    star.setAttribute('aria-label', 'Favorite ' + channel.name);
    star.textContent = '';
    star.appendChild(icon(favorite ? 'star' : 'star-outline'));
    $('.card', cell).setAttribute('aria-label', cardLabel(channel));
}

function buildCard(channel) {
    const card = h('button.card', {
        type: 'button',
        'data-nav': true,
        'data-key': channel.key,
        'aria-keyshortcuts': 'S'
    }, [
        h('span.card-plate', null, [
            channelLogo(channel),
            h('span.card-number', { 'aria-hidden': 'true', text: String(channel.number) })
        ]),
        h('span.card-info', null, [
            h('span.card-name', { text: channel.name }),
            h('span.card-group', { text: channel.groupLabel })
        ])
    ]);

    // A sibling, not nested: a button inside a button is invalid and breaks
    // hit-testing. Not a D-pad stop (S / yellow key / player star instead).
    const star = h('button.card-fav', {
        type: 'button',
        tabindex: '-1',
        onclick: (event) => {
            event.stopPropagation();
            toggleFavoriteWithToast(channel);
        }
    });

    attachLongPress(card, () => toggleFavoriteWithToast(channel));
    card.addEventListener('click', () => {
        // Swallow only the click that directly follows a long press; a later
        // mouse / keyboard activation must still work
        if (card.hasAttribute('data-long-pressed')) {
            const releasedAt = Number(card.getAttribute('data-long-pressed')) || 0;
            card.removeAttribute('data-long-pressed');
            if (!releasedAt || Date.now() - releasedAt < 800) return;
        }
        tune(channel, visibleChannels());
    });

    const cell = h('li.card-cell', null, [card, star]);
    updateStar(cell, channel);
    return cell;
}

function cellFor(channel) {
    if (!cardCache[channel.key]) {
        cardCache[channel.key] = buildCard(channel);
    }
    return cardCache[channel.key];
}

/**
 * Long-press on touch screens toggles favorite (touch events: iOS 12 has no
 * Pointer Events)
 * @param {HTMLElement} el
 * @param {Function} action
 */
function attachLongPress(el, action) {
    let timer = null;
    let startX = 0;
    let startY = 0;

    const cancel = () => {
        clearTimeout(timer);
        timer = null;
    };

    el.addEventListener('touchstart', (event) => {
        // Android sends no click after a long press: never let the flag outlive it
        el.removeAttribute('data-long-pressed');
        if (event.touches.length !== 1) {
            cancel();
            return;
        }
        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
        cancel();
        timer = setTimeout(() => {
            timer = null;
            el.setAttribute('data-long-pressed', 'true');
            if (navigator.vibrate) {
                try { navigator.vibrate(12); } catch (_error) { /* no-op */ }
            }
            action();
        }, 500);
    }, { passive: true });
    el.addEventListener('touchmove', (event) => {
        if (!timer) return;
        const touch = event.touches[0];
        if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) cancel();
    }, { passive: true });
    el.addEventListener('touchend', (event) => {
        cancel();
        if (el.hasAttribute('data-long-pressed')) {
            // Stamp the release so only an immediate follow-up click is swallowed
            el.setAttribute('data-long-pressed', String(Date.now()));
            if (event.cancelable) event.preventDefault();
        }
    });
    el.addEventListener('touchcancel', () => {
        cancel();
        // No click ever follows a cancelled touch
        el.removeAttribute('data-long-pressed');
    });
    el.addEventListener('contextmenu', (event) => {
        if (el.hasAttribute('data-long-pressed') || timer || isCoarsePointer()) event.preventDefault();
    });
}

/* ---------- Sections ---------- */

function sectionEl(title, count, channels, id) {
    const headingId = 'section-' + id;
    const list = h('ul.grid', { role: 'list', 'aria-labelledby': headingId });
    channels.forEach((channel) => list.appendChild(cellFor(channel)));
    return h('section.section', { 'aria-labelledby': headingId }, [
        h('div.section-head', null, [
            h('h2.section-title', { id: headingId, text: title }),
            count !== null ? h('span.section-count', { text: String(count) }) : null
        ]),
        list
    ]);
}

function renderSections() {
    const focused = document.activeElement;
    const focusedKey = focused && els.sections.contains(focused) ? focused.getAttribute('data-key') : null;
    const focusedIndex = focusedKey ? $$('.card-cell', els.sections).indexOf(cardCache[focusedKey]) : -1;
    const resumeFocused = !!focused && els.resume.contains(focused);

    els.sections.textContent = '';
    els.status.textContent = '';
    els.status.className = 'browse-status';
    renderResume();

    if (!state.channels.length) {
        if (resumeFocused) focusBrowseStart();
        return;
    }

    const fragment = document.createDocumentFragment();
    if (state.query) {
        const results = searchResults();
        if (results.length) fragment.appendChild(sectionEl('Results', results.length, results, 'results'));
        else renderEmpty();
    } else if (state.category === ALL) {
        state.categories.forEach((category, i) => {
            const channels = state.channels.filter((channel) => channel.group === category.id);
            fragment.appendChild(sectionEl(category.label, channels.length, channels, 'g' + i));
        });
    } else if (state.category === FAVORITES) {
        const favorites = favoriteChannels();
        if (favorites.length) fragment.appendChild(sectionEl('Favorites', favorites.length, favorites, 'favorites'));
        else renderEmpty();
    } else {
        const category = state.categories.filter((item) => item.id === state.category)[0];
        const channels = visibleChannels();
        fragment.appendChild(sectionEl(category ? category.label : 'Channels', channels.length, channels, 'category'));
    }
    els.sections.appendChild(fragment);

    // A playlist refresh rebuilt the focused "continue watching" card
    if (resumeFocused) {
        const card = $('.resume-card', els.resume);
        if (card && isVisible(card)) {
            focusQuietly(card);
        } else {
            focusBrowseStart();
        }
        return;
    }

    if (!focusedKey) return;
    if (cardCache[focusedKey] && els.sections.contains(cardCache[focusedKey])) {
        focusQuietly($('.card', cardCache[focusedKey]));
        return;
    }
    // The focused card left the list (un-favorited on the Favorites tab):
    // keep the place instead of dropping focus to the page
    const cells = $$('.card-cell', els.sections);
    const next = focusedIndex >= 0 && cells.length ? cells[Math.min(focusedIndex, cells.length - 1)] : null;
    if (next) {
        focusElement($('.card', next));
    } else {
        const tab = $('.tab.is-active', els.tabs);
        if (tab) focusElement(tab);
    }
}

function renderEmpty() {
    els.status.className = 'browse-status is-empty';
    if (state.query) {
        els.status.appendChild(icon('search', 'empty-icon'));
        els.status.appendChild(h('p.empty-title', { text: `No channels match “${state.query}”` }));
        els.status.appendChild(h('button.btn', {
            type: 'button',
            'data-nav': true,
            onclick: () => clearSearch(true)
        }, [icon('close'), h('span', { text: 'Clear search' })]));
        return;
    }
    els.status.appendChild(icon('star-outline', 'empty-icon'));
    els.status.appendChild(h('p.empty-title', { text: 'No favorites yet' }));
    els.status.appendChild(h('p.empty-text', {
        text: isTvMode()
            ? 'While watching, press OK on the ★ button (or the yellow key) to add a channel here.'
            : isCoarsePointer()
                ? 'Tap the ☆ on a channel, or press and hold it, to add it here.'
                : 'Click the ☆ on a channel, or press S on it, to add it here.'
    }));
}

/**
 * Skeleton cards while the playlist loads
 */
export function showLoading() {
    els.status.textContent = '';
    els.status.className = 'browse-status';
    els.sections.textContent = '';
    const list = h('ul.grid', { 'aria-hidden': 'true' });
    for (let i = 0; i < 12; i += 1) {
        list.appendChild(h('li.card-cell.is-skeleton', null, [
            h('span.card.skeleton', null, [
                h('span.card-plate'),
                h('span.card-info', null, [h('span.skeleton-line'), h('span.skeleton-line.is-short')])
            ])
        ]));
    }
    els.sections.appendChild(h('section.section', null, [
        h('div.section-head', null, [h('h2.section-title', { text: 'Loading channels…' })]),
        list
    ]));
}

/**
 * Error state with a retry button
 * @param {string} message
 * @param {Function} onRetry
 */
export function showError(message, onRetry) {
    els.sections.textContent = '';
    els.status.textContent = '';
    els.status.className = 'browse-status is-error';
    els.status.appendChild(icon('error', 'empty-icon'));
    els.status.appendChild(h('p.empty-title', { text: message }));
    els.status.appendChild(h('p.empty-text', { text: 'Check your internet connection and try again.' }));
    const retry = h('button.btn.btn-primary', { type: 'button', 'data-nav': true, onclick: onRetry }, [
        icon('refresh'), h('span', { text: 'Try again' })
    ]);
    els.status.appendChild(retry);
    if ((isKeyboardMode() || isTvMode()) && !document.documentElement.classList.contains('sheet-open')) {
        focusElement(retry);
    }
}

/* ---------- Favorites ---------- */

function toggleFavoriteWithToast(channel) {
    const active = toggleFavorite(channel);
    showToast(active ? `★ Added ${channel.name} to favorites` : `Removed ${channel.name} from favorites`);
}

/**
 * Favorite whichever card has focus (S key / yellow button)
 * @returns {boolean} whether a card was focused
 */
export function toggleFavoriteOnFocused() {
    const focused = document.activeElement;
    const key = focused && focused.getAttribute ? focused.getAttribute('data-key') : null;
    if (!key) return false;
    const channel = state.channels.filter((item) => item.key === key)[0];
    if (!channel) return false;
    toggleFavoriteWithToast(channel);
    return true;
}

/* ---------- Search ---------- */

function setSearchOpen(open) {
    searchOpen = open;
    els.topbar.classList.toggle('search-open', open);
    els.searchToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function compactSearch() {
    // Exact complement of the CSS breakpoint (fractional widths like 899.2px)
    return isTvMode() || !window.matchMedia('(min-width: 900px)').matches;
}

function applyQuery(value) {
    state.query = value;
    els.searchClear.hidden = !value;
    renderTabs();
    renderSections();
    window.scrollTo(0, 0);
}

/**
 * Clear the search box
 * @param {boolean} refocus - put focus back into the field
 */
export function clearSearch(refocus) {
    els.search.value = '';
    applyQuery('');
    if (refocus) {
        els.search.focus();
    } else if (searchOpen && compactSearch()) {
        setSearchOpen(false);
    }
}

/**
 * Open and focus search. Must run inside the tap/key handler: iOS only shows
 * the keyboard for focus() called from a user gesture.
 */
export function focusSearch() {
    // Wide screens show the field inline; only compact layouts expand a row
    if (compactSearch()) setSearchOpen(true);
    els.search.focus();
    try { els.search.select(); } catch (_error) { /* no-op */ }
}

function leaveSearch() {
    els.search.blur();
    if (compactSearch()) {
        if (!els.search.value) setSearchOpen(false);
        focusElement(els.searchToggle);
    }
}

function initSearch() {
    els.search.addEventListener('input', () => applyQuery(els.search.value));
    els.search.addEventListener('keydown', (event) => {
        const key = event.key;
        if (key === 'Enter') {
            event.preventDefault();
            // A held OK / Enter that opened search must not also leave it
            if (event.repeat) return;
            const results = searchResults();
            if (results.length === 1 && state.query) {
                tune(results[0], results);
                return;
            }
            const first = $('.card', els.sections);
            els.search.blur();
            if (first) focusElement(first);
        } else if (key === 'Escape' || key === 'Esc') {
            event.preventDefault();
            event.stopPropagation();
            if (els.search.value) {
                clearSearch(true);
            } else {
                leaveSearch();
            }
        } else if (key === 'GoBack' || key === 'XF86Back' || event.keyCode === 461 || event.keyCode === 10009) {
            // TV remote Back while typing: leave the field, keep the query
            event.preventDefault();
            event.stopPropagation();
            leaveSearch();
        } else if (key === 'ArrowDown' || key === 'Down') {
            event.preventDefault();
            event.stopPropagation();
            const first = $('.card', els.sections) || $('.tab', els.tabs);
            els.search.blur();
            if (first) focusElement(first);
        } else if ((key === 'ArrowUp' || key === 'Up') && compactSearch()) {
            event.preventDefault();
            event.stopPropagation();
            leaveSearch();
        }
    });
    els.searchClear.addEventListener('click', () => clearSearch(true));
    els.searchToggle.addEventListener('click', () => {
        if (searchOpen && !els.search.value && compactSearch()) {
            els.search.blur();
            setSearchOpen(false);
        } else {
            focusSearch();
        }
    });
    // Drop the on-screen keyboard when the user starts scrolling results
    els.sections.addEventListener('touchstart', () => {
        if (document.activeElement === els.search) els.search.blur();
    }, { passive: true });
}

/* ---------- Tune ---------- */

function tune(channel, list) {
    emit('tune', { channel, list: list && list.length ? list : state.channels, gesture: true });
}

/* ---------- Picture-in-picture return pill ---------- */

/**
 * Show / hide the "playing in picture-in-picture" pill
 * @param {Object|null} channel
 */
export function setPipReturn(channel) {
    els.pipReturn.hidden = !channel;
    if (channel) els.pipReturnName.textContent = channel.name;
}

/* ---------- Public ---------- */

/**
 * On TVs, landing on a text field pops a full-screen keyboard, so the field
 * is not a D-pad stop there: the Search button opens it instead.
 */
function syncSearchMode() {
    if (isTvMode()) {
        els.search.removeAttribute('data-nav');
    } else {
        els.search.setAttribute('data-nav', '');
    }
}

/**
 * Render everything for a fresh channel list
 */
export function renderBrowse() {
    syncSearchMode();
    if (state.category !== ALL && state.category !== FAVORITES
        && !state.categories.some((item) => item.id === state.category)) {
        setCategory(ALL);
    }
    cardCache = {};
    renderTabs();
    renderSections();
    centerActiveTab();
}

/**
 * The guide became visible again (after watching)
 */
export function onBrowseShown() {
    pushScope(els.root);
    renderResume();

    if (!isKeyboardMode() && !isTvMode()) return;
    const key = state.current ? state.current.key : null;
    const cell = key ? cardCache[key] : null;
    const card = cell && els.sections.contains(cell) ? $('.card', cell) : null;
    if (card && isVisible(card)) {
        focusElement(card);
    } else {
        focusBrowseStart();
    }
}

export function onBrowseHidden() {
    popScope(els.root);
}

/**
 * Remote users start on "continue watching", else on the first channel
 */
export function focusBrowseStart() {
    const resume = $('.resume-card', els.resume);
    const target = resume && isVisible(resume) ? resume : $('.card', els.sections);
    if (target) {
        focusElement(target);
    } else {
        focusInitial(els.root);
    }
}

export function initBrowse() {
    els = {
        root: $('#browse'),
        topbar: $('#topbar'),
        tabs: $('#categoryTabs'),
        resume: $('#resume'),
        sections: $('#sections'),
        status: $('#browseStatus'),
        search: $('#search'),
        searchClear: $('#searchClear'),
        searchToggle: $('#searchToggle'),
        pipReturn: $('#pipReturn'),
        pipReturnName: $('#pipReturnName')
    };

    pushScope(els.root);
    setTopObstruction(() => (isTvMode() ? 0 : els.topbar.getBoundingClientRect().bottom));
    initSearch();

    els.pipReturn.addEventListener('click', () => emit('pip:return'));

    const onScroll = () => {
        document.documentElement.classList.toggle('is-scrolled', window.pageYOffset > 4);
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    on('favorites', () => {
        renderTabs();
        if (state.category === FAVORITES && !state.query) {
            renderSections();
            return;
        }
        Object.keys(cardCache).forEach((key) => {
            const channel = state.channels.filter((item) => item.key === key)[0];
            if (channel) updateStar(cardCache[key], channel);
        });
    });
}
