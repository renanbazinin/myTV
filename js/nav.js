// nav.js - Spatial (D-pad) navigation, focus scopes and input-modality tracking
//
// Focusable targets carry [data-nav]. Arrow keys move focus to the nearest
// target in that direction inside the top-most scope (a sheet, the channel
// list, the player or the guide). Regions marked [data-nav-region="remember"]
// restore their last focused (or selected) item when focus re-enters them,
// e.g. the category tabs return to the selected tab.

import { $$, isVisible } from './dom.js';

const scopes = [];
const regionMemory = typeof WeakMap === 'function' ? new WeakMap() : null;
const scopeMemory = typeof WeakMap === 'function' ? new WeakMap() : null;
let topObstruction = () => 0;
let keyboardMode = false;
let lastMoveAt = 0;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTv = () => document.documentElement.classList.contains('tv');

// focus({preventScroll}) arrived in Chrome 64; 2019 Samsung TVs run Chrome 63
let preventScrollSupported = false;
try {
    const probe = document.createElement('div');
    probe.focus({
        get preventScroll() {
            preventScrollSupported = true;
            return true;
        }
    });
} catch (_error) {
    preventScrollSupported = false;
}

/**
 * Focus an element without letting the browser scroll it into view
 * @param {HTMLElement} el
 */
export function focusQuietly(el) {
    if (!el) return;
    if (preventScrollSupported) {
        el.focus({ preventScroll: true });
        return;
    }
    const x = window.pageXOffset;
    const y = window.pageYOffset;
    el.focus();
    window.scrollTo(x, y);
}

/**
 * Make arrows navigate inside `root` until the scope is popped
 * @param {HTMLElement} root
 */
export function pushScope(root) {
    popScope(root);
    scopes.push(root);
}

export function popScope(root) {
    for (let i = scopes.length - 1; i >= 0; i -= 1) {
        if (scopes[i] === root) scopes.splice(i, 1);
    }
}

export function activeScope() {
    for (let i = scopes.length - 1; i >= 0; i -= 1) {
        if (scopes[i].isConnected && isVisible(scopes[i])) return scopes[i];
    }
    return document.body;
}

/**
 * Report how much of the top of the viewport is covered by sticky chrome, so
 * focused items are scrolled clear of it.
 * @param {Function} fn - returns pixels
 */
export function setTopObstruction(fn) {
    topObstruction = fn;
}

export function isKeyboardMode() {
    return keyboardMode;
}

export function setKeyboardMode(enabled) {
    if (keyboardMode === enabled) return;
    keyboardMode = enabled;
    document.documentElement.classList.toggle('kbd-nav', enabled);
    document.documentElement.classList.toggle('pointer-nav', !enabled);
}

/**
 * Track whether the user drives the UI with keys/remote or a pointer
 */
export function initModality() {
    document.documentElement.classList.add('pointer-nav');

    document.addEventListener('keydown', (event) => {
        const code = event.keyCode;
        if ((code >= 37 && code <= 40) || code === 9 || code === 13 || /^(Arrow|Up$|Down$|Left$|Right$|Tab$|Enter$)/.test(event.key || '')) {
            setKeyboardMode(true);
        }
    }, true);

    let lastX = -1;
    let lastY = -1;
    document.addEventListener('mousemove', (event) => {
        // Some TV browsers fire synthetic mousemoves; require real movement
        if (lastX >= 0 && (Math.abs(event.clientX - lastX) > 4 || Math.abs(event.clientY - lastY) > 4)) {
            setKeyboardMode(false);
        }
        lastX = event.clientX;
        lastY = event.clientY;
    }, { passive: true });

    document.addEventListener('mousedown', () => setKeyboardMode(false), true);
    document.addEventListener('touchstart', () => setKeyboardMode(false), { passive: true, capture: true });

    // LG Magic Remote: pointer shown / hidden
    document.addEventListener('cursorStateChange', (event) => {
        if (event && event.detail) setKeyboardMode(!event.detail.visibility);
    });

    // TV pointer (Magic Remote, Samsung pointer mode): hovering focuses, so
    // the pointer and the D-pad share one highlight
    document.addEventListener('mouseover', (event) => {
        if (!isTv() || keyboardMode) return;
        const target = event.target instanceof Element ? event.target.closest('[data-nav]') : null;
        if (target && target !== document.activeElement && activeScope().contains(target)) {
            focusQuietly(target);
        }
    });

    document.addEventListener('focusin', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (regionMemory) {
            const region = target.closest('[data-nav-region]');
            if (region) regionMemory.set(region, target);
        }
        if (scopeMemory && target.hasAttribute('data-nav')) {
            const scope = activeScope();
            if (scope.contains(target)) scopeMemory.set(scope, target);
        }
    });
}

/**
 * Visible, enabled navigation targets inside a root
 * @param {Element} [root]
 */
export function focusables(root) {
    return $$('[data-nav]', root || activeScope()).filter((el) => !el.disabled && isVisible(el));
}

function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

/**
 * Distance score for moving from `from` to `to` in `dir` (Infinity = not in that direction)
 */
function score(from, to, dir) {
    let primary;
    let overlapStart;
    let overlapEnd;
    let offset;

    const horizontal = dir === 'right' || dir === 'left';
    if (horizontal) {
        if (dir === 'right' && !(to.cx > from.cx + 1 && to.left > from.left + 1)) return Infinity;
        if (dir === 'left' && !(to.cx < from.cx - 1 && to.right < from.right - 1)) return Infinity;
        primary = dir === 'right' ? to.left - from.right : from.left - to.right;
        overlapStart = Math.max(from.top, to.top);
        overlapEnd = Math.min(from.bottom, to.bottom);
        offset = Math.abs(to.cy - from.cy);
    } else {
        if (dir === 'down' && !(to.cy > from.cy + 1 && to.top > from.top + 1)) return Infinity;
        if (dir === 'up' && !(to.cy < from.cy - 1 && to.bottom < from.bottom - 1)) return Infinity;
        primary = dir === 'down' ? to.top - from.bottom : from.top - to.bottom;
        overlapStart = Math.max(from.left, to.left);
        overlapEnd = Math.min(from.right, to.right);
        // Leaving a wide item (a banner) lands on the left-most column under it
        const fromWidth = from.right - from.left;
        const toWidth = to.right - to.left;
        const anchorX = fromWidth > toWidth * 2 ? from.left + toWidth / 2 : from.cx;
        offset = Math.abs(to.cx - anchorX);
    }

    primary = Math.max(0, primary);
    // Items sharing a row/column with the current one ("in the beam") win.
    // Left/right never jumps to another row; up/down may drift sideways.
    const inBeam = overlapEnd - overlapStart > 2;
    if (!inBeam && horizontal) return Infinity;
    return primary + (inBeam ? offset * 0.15 : 1000 + offset * 2);
}

function rememberedIn(region) {
    if (!region || region.getAttribute('data-nav-region') !== 'remember') return null;
    // The selected item wins (e.g. the active category); memory only matters
    // when nothing is selected
    const selected = region.querySelector('[data-nav][aria-selected="true"], [data-nav].is-active');
    if (selected && isVisible(selected)) return selected;
    const remembered = regionMemory ? regionMemory.get(region) : null;
    return remembered && region.contains(remembered) && isVisible(remembered) ? remembered : null;
}

/**
 * Move focus in a direction. Returns false when nothing lies that way.
 * @param {'up'|'down'|'left'|'right'} dir
 * @param {KeyboardEvent} [event] - repeats are throttled so slow TVs don't overshoot
 * @returns {boolean}
 */
export function move(dir, event) {
    if (event && event.repeat) {
        const now = Date.now();
        if (now - lastMoveAt < 80) return true;
        lastMoveAt = now;
    }

    const scope = activeScope();
    const items = focusables(scope);
    if (!items.length) return false;

    const current = document.activeElement;
    if (!current || !scope.contains(current) || items.indexOf(current) === -1) {
        focusInitial(scope);
        return true;
    }

    const from = rectOf(current);
    let best = null;
    let bestScore = Infinity;
    items.forEach((el) => {
        if (el === current) return;
        const value = score(from, rectOf(el), dir);
        if (value < bestScore) {
            bestScore = value;
            best = el;
        }
    });

    if (!best) return false;

    const fromRegion = current.closest('[data-nav-region]');
    const toRegion = best.closest('[data-nav-region]');
    if (toRegion && toRegion !== fromRegion) {
        best = rememberedIn(toRegion) || best;
    }

    focusElement(best);
    return true;
}

/**
 * Focus the scope's remembered item, else [data-nav-initial], else the first target
 * @param {Element} [scope]
 */
export function focusInitial(scope) {
    const root = scope || activeScope();
    const remembered = scopeMemory ? scopeMemory.get(root) : null;
    if (remembered && root.contains(remembered) && isVisible(remembered)) {
        focusElement(remembered);
        return remembered;
    }
    const preferred = $$('[data-nav-initial]', root).filter((el) => isVisible(el) && el.hasAttribute('data-nav'))[0];
    const target = preferred || focusables(root)[0];
    if (target) focusElement(target);
    return target || null;
}

/**
 * Focus without the browser's jumpy default scroll, then reveal it ourselves
 * @param {HTMLElement} el
 */
export function focusElement(el) {
    if (!el) return;
    focusQuietly(el);
    revealElement(el);
}

/**
 * Scroll an element into view, clear of sticky chrome, with a peek at the
 * next row below
 * @param {HTMLElement} el
 */
export function revealElement(el) {
    const tv = isTv();
    const behavior = prefersReducedMotion() || tv ? 'auto' : 'smooth';
    const pad = Math.round(window.innerHeight * 0.04) + 8;

    const scrollerX = el.closest('[data-nav-scroll-x]');
    if (scrollerX) {
        const r = el.getBoundingClientRect();
        const c = scrollerX.getBoundingClientRect();
        if (r.left < c.left + pad) {
            scrollerX.scrollLeft -= (c.left + pad - r.left);
        } else if (r.right > c.right - pad) {
            scrollerX.scrollLeft += (r.right - (c.right - pad));
        }
    }

    const scrollerY = el.closest('[data-nav-scroll-y]');
    const r = el.getBoundingClientRect();
    if (scrollerY) {
        // Lists keep the focused row centred
        const c = scrollerY.getBoundingClientRect();
        if (r.top < c.top + pad || r.bottom > c.bottom - pad) {
            scrollerY.scrollTop += (r.top + r.height / 2) - (c.top + c.height / 2);
        }
        return;
    }

    if (el.closest('[data-nav-scroll-top]')) {
        if (window.pageYOffset > 0) scrollWindow(-window.pageYOffset, behavior);
        return;
    }

    const top = topObstruction() + pad;
    const peek = tv ? r.height * 0.4 : pad;
    const bottom = window.innerHeight - peek;
    if (r.top < top) {
        scrollWindow(r.top - top, behavior);
    } else if (r.bottom > bottom) {
        scrollWindow(r.bottom - bottom, behavior);
    }
}

function scrollWindow(delta, behavior) {
    if (behavior === 'smooth') {
        try {
            window.scrollBy({ top: delta, left: 0, behavior });
            return;
        } catch (_error) {
            // Old engines: fall through to an instant scroll
        }
    }
    window.scrollBy(0, delta);
}
