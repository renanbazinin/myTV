// overlays.js - Toasts, screen-reader announcements, modal sheets (settings,
// help) and the channel-number OSD

import { $, $$, isVisible } from '../dom.js';
import { openLayer, closeLayer, isOpen, replaceTopLayer } from '../layers.js';
import { pushScope, popScope, focusInitial, focusElement, focusQuietly, isKeyboardMode } from '../nav.js';
import { NUMBER_ENTRY_MS } from '../config.js';
import { fullscreenElement, toggleFullscreen } from '../device.js';

/* ---------- Toast ---------- */

let toastTimer = null;

/**
 * Show a short, non-blocking message. The live region is only hidden
 * visually (opacity), never removed from the accessibility tree, so screen
 * readers announce each new message.
 * @param {string} message
 * @param {number} [durationMs]
 */
export function showToast(message, durationMs) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('is-visible');
        toastTimer = setTimeout(() => {
            if (!toast.classList.contains('is-visible')) toast.textContent = '';
        }, 250);
    }, durationMs || 2800);
}

/* ---------- Announcer ---------- */

let announceTimer = null;

/**
 * Polite screen-reader announcement, debounced so fast zapping only
 * announces where the user stops
 * @param {string} message
 * @param {number} [delayMs]
 */
export function announce(message, delayMs) {
    const el = $('#announcer');
    if (!el) return;
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
        el.textContent = '';
        setTimeout(() => {
            el.textContent = message;
        }, 50);
    }, delayMs === undefined ? 400 : delayMs);
}

/* ---------- Sheets ---------- */

const openers = {};

function sheetFocusables(sheet) {
    // Only Tab stops: roving-tabindex tabs / segments (tabindex -1) don't count
    return $$('button, [href], input, select, textarea, [tabindex]', sheet)
        .filter((el) => !el.disabled && el.tabIndex >= 0 && isVisible(el));
}

function hideSheet(sheet) {
    sheet.classList.remove('is-open');
    popScope(sheet);
    const anyOpen = $$('.sheet').some((item) => item !== sheet && item.classList.contains('is-open'));
    document.documentElement.classList.toggle('sheet-open', anyOpen);
    if (!anyOpen) {
        const app = $('#app');
        if (app) app.removeAttribute('aria-hidden');
    }
    setTimeout(() => {
        if (!sheet.classList.contains('is-open')) sheet.hidden = true;
    }, 220);

    const opener = openers[sheet.id];
    delete openers[sheet.id];
    if (opener && opener.isConnected && isVisible(opener)) {
        if (isKeyboardMode()) {
            focusElement(opener);
        } else {
            focusQuietly(opener);
        }
    }
}

/**
 * Open a modal sheet
 * @param {HTMLElement} sheet
 * @param {HTMLElement} [focusTarget] - element to focus first
 * @param {HTMLElement} [replacing] - an open sheet this one takes over from
 */
export function openSheet(sheet, focusTarget, replacing) {
    if (!sheet || isOpen(sheet.id)) return;
    // Sheets live outside the player: they can't be seen over a fullscreen video
    if (fullscreenElement()) toggleFullscreen(null, null);
    const active = document.activeElement;
    if (replacing && isOpen(replacing.id)) {
        // Inherit the original opener so focus returns to e.g. the gear button
        openers[sheet.id] = openers[replacing.id] || null;
        delete openers[replacing.id];
    } else {
        openers[sheet.id] = active && active !== document.body ? active : null;
    }
    sheet.hidden = false;
    // Force a style flush so the transition runs
    void sheet.offsetWidth;
    sheet.classList.add('is-open');
    document.documentElement.classList.add('sheet-open');
    pushScope(sheet);
    if (replacing && isOpen(replacing.id)) {
        replaceTopLayer(sheet.id, () => hideSheet(sheet));
    } else {
        openLayer(sheet.id, () => hideSheet(sheet));
    }

    // Focus moves into the sheet first, then the page behind is hidden
    if (focusTarget) {
        focusElement(focusTarget);
    } else if (isKeyboardMode() || document.documentElement.classList.contains('tv')) {
        focusInitial(sheet);
    } else {
        const close = $('.sheet-close', sheet);
        if (close) focusQuietly(close);
    }
    const app = $('#app');
    if (app) app.setAttribute('aria-hidden', 'true');
}

/**
 * @param {HTMLElement} sheet
 * @param {Function} [onClosed] - runs after the sheet's history entry is gone
 */
export function closeSheet(sheet, onClosed) {
    if (sheet) closeLayer(sheet.id, onClosed);
}

export function isSheetOpen() {
    return !!$('.sheet.is-open');
}

/**
 * Wire close buttons, backdrop clicks and the Tab focus trap for all sheets
 */
export function initSheets() {
    $$('.sheet').forEach((sheet) => {
        sheet.addEventListener('click', (event) => {
            if (event.target === sheet) closeSheet(sheet);
        });
        $$('.sheet-close', sheet).forEach((button) => {
            button.addEventListener('click', () => closeSheet(sheet));
        });
    });

    // Focus trap. On the document, so it also catches Tab while focus is
    // outside the sheet (e.g. on <body> after clicking panel text).
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab') return;
        const open = $$('.sheet.is-open');
        const sheet = open[open.length - 1];
        if (!sheet) return;
        const items = sheetFocusables(sheet);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;

        if (!active || !sheet.contains(active)) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
            return;
        }
        if (items.indexOf(active) === -1) {
            // On a roving tab (tabindex -1, reached with the arrows): carry on
            // from its position instead of letting Tab escape
            const following = items.filter((el) => active.compareDocumentPosition(el) & 4);
            const preceding = items.filter((el) => active.compareDocumentPosition(el) & 2);
            event.preventDefault();
            (event.shiftKey ? (preceding[preceding.length - 1] || last) : (following[0] || first)).focus();
            return;
        }
        if (event.shiftKey && active === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        }
    });
}

/* ---------- Help ---------- */

/**
 * Select a help tab
 * @param {'remote'|'keyboard'|'touch'} name
 */
export function setHelpTab(name) {
    const sheet = $('#helpSheet');
    $$('.help-tab', sheet).forEach((tab) => {
        const active = tab.getAttribute('data-tab') === name;
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
        tab.setAttribute('tabindex', active ? '0' : '-1');
        tab.classList.toggle('is-active', active);
    });
    $$('[data-panel]', sheet).forEach((panel) => {
        panel.hidden = panel.getAttribute('data-panel') !== name;
    });
}

export function initHelp() {
    const sheet = $('#helpSheet');
    if (!sheet) return;
    $$('.help-tab', sheet).forEach((tab) => {
        tab.addEventListener('click', () => setHelpTab(tab.getAttribute('data-tab')));
        tab.addEventListener('focus', () => setHelpTab(tab.getAttribute('data-tab')));
    });
}

/**
 * Open help on the tab that matches how the user is driving the app
 * @param {string} preferredTab
 * @param {HTMLElement} [replacing] - sheet that help replaces (Settings)
 */
export function openHelp(preferredTab, replacing) {
    setHelpTab(preferredTab);
    openSheet($('#helpSheet'), null, replacing);
}

/* ---------- Channel number entry ---------- */

let digits = '';
let entryTimer = null;

function renderEntry(maxDigits) {
    const box = $('#numberEntry');
    if (!box) return;
    let text = digits;
    while (text.length < maxDigits) text += '–';
    box.textContent = text;
    box.hidden = !digits;
}

export function resetNumberEntry() {
    digits = '';
    clearTimeout(entryTimer);
    entryTimer = null;
    renderEntry(1);
}

/**
 * Feed a digit; commits when enough digits are typed or after a pause
 * @param {number} digit
 * @param {number} maxDigits - digits needed to address every channel
 * @param {Function} onCommit - called with the channel number
 */
export function pushDigit(digit, maxDigits, onCommit) {
    if (!digits && digit === 0) return;
    digits += String(digit);
    renderEntry(maxDigits);
    clearTimeout(entryTimer);

    const commit = () => {
        const number = parseInt(digits, 10);
        resetNumberEntry();
        if (number > 0) onCommit(number);
    };

    entryTimer = setTimeout(commit, digits.length >= maxDigits ? 250 : NUMBER_ENTRY_MS);
}

export function isEnteringNumber() {
    return digits.length > 0;
}
