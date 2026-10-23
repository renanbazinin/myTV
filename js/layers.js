// layers.js - Stack of closable layers (player, channel list, sheets) mirrored
// in browser history, so the Android back gesture, iOS edge swipe, a TV
// remote's Back button and the browser's back button all close the top-most
// layer instead of leaving the site.
//
// Rules (TV browsers and Chromium's history-manipulation intervention):
// - history.pushState only runs inside a real user input. A layer opened
//   without one (e.g. auto-play on start) is pushed on the next input.
// - Only popstate closes pushed layers; UI close buttons call history.back().
// - Back *keys* wait briefly: some TV browsers also navigate history
//   themselves, and a single press must never close two layers.

const stack = []; // [{id, hide, pushed}]
let hasActivation = false;
let backTimer = null;
// Time of the last history pop the browser did by itself (no Back keydown
// before it), to swallow a Back keydown that arrives after it
let lastPopAt = 0;
// Pops the app causes itself with history.go() don't count
let ownPopUntil = 0;
let guardEnabled = false;
let guardArmed = false;
let onExitAttempt = null;

const BACK_KEY_DELAY_MS = 200;

function pushedCount() {
    return stack.filter((layer) => layer.pushed).length;
}

function push(layer) {
    layer.pushed = true;
    try {
        window.history.pushState({ mytv: true, d: pushedCount(), l: layer.id }, '');
    } catch (_error) {
        layer.pushed = false;
    }
}

function flushPending() {
    stack.forEach((layer) => {
        if (!layer.pushed) push(layer);
    });
}

function armGuard() {
    if (!guardEnabled || guardArmed || stack.length) return;
    guardArmed = true;
    try {
        window.history.pushState({ mytv: true, d: 0, guard: true }, '');
    } catch (_error) {
        guardArmed = false;
    }
}

/**
 * Register an open layer. `hide` must only update the UI — never history.
 * @param {string} id
 * @param {Function} hide
 */
export function openLayer(id, hide) {
    if (isOpen(id)) return;
    const layer = { id, hide, pushed: false };
    stack.push(layer);
    if (hasActivation) push(layer);
}

/**
 * Swap the top-most layer for another one in place (same history entry), e.g.
 * Settings -> Help. replaceState needs no user activation.
 * @param {string} id
 * @param {Function} hide
 */
export function replaceTopLayer(id, hide) {
    const top = stack[stack.length - 1];
    if (!top) {
        openLayer(id, hide);
        return;
    }
    stack.pop();
    top.hide();
    const layer = { id, hide, pushed: top.pushed };
    stack.push(layer);
    if (layer.pushed) {
        try {
            window.history.replaceState({ mytv: true, d: pushedCount(), l: id }, '');
        } catch (_error) {
            // ignore
        }
    }
}

export function isOpen(id) {
    return stack.some((layer) => layer.id === id);
}

export function topLayer() {
    return stack.length ? stack[stack.length - 1].id : null;
}

function hideFrom(index) {
    const removed = stack.splice(index);
    removed.reverse().forEach((layer) => {
        layer.hide();
        if (layer.onClosed) setTimeout(layer.onClosed, 0);
    });
}

/**
 * Close a layer (and anything stacked above it) from an on-screen control
 * @param {string} id
 * @param {Function} [onClosed] - runs once the layer is really gone (use it to
 *   open the next layer, so history entries never race)
 * @returns {boolean}
 */
export function closeLayer(id, onClosed) {
    let index = -1;
    stack.forEach((layer, i) => {
        if (layer.id === id) index = i;
    });
    if (index === -1) return false;
    if (onClosed) stack[index].onClosed = onClosed;

    const pushedToClose = stack.slice(index).filter((layer) => layer.pushed).length;
    if (!pushedToClose) {
        hideFrom(index);
        return true;
    }
    // Unpushed layers above can go right away; popstate closes the rest
    for (let i = stack.length - 1; i > index; i -= 1) {
        if (!stack[i].pushed) hideFrom(i);
    }
    ownPopUntil = Date.now() + 1000;
    try {
        window.history.go(-pushedToClose);
    } catch (_error) {
        ownPopUntil = 0;
        hideFrom(index);
    }
    return true;
}

/**
 * True right after the browser navigated back on its own: a Back keydown
 * arriving now belongs to that same press
 */
export function backJustHandled() {
    return Date.now() - lastPopAt < 400;
}

/**
 * Escape / on-screen back: close the top-most layer now
 * @returns {boolean} false when nothing is open
 */
export function back() {
    const top = topLayer();
    return top ? closeLayer(top) : false;
}

/**
 * TV remote Back key. Waits briefly for the browser's own history
 * navigation; if none arrives, goes back ourselves.
 * @returns {boolean} whether the app handled it (false = let the TV exit)
 */
export function backFromRemote() {
    // The browser already went back for this press (its keydown arrived late)
    if (backJustHandled()) {
        lastPopAt = 0;
        return true;
    }
    if (!stack.length) return false;
    clearTimeout(backTimer);
    backTimer = setTimeout(() => {
        backTimer = null;
        back();
    }, BACK_KEY_DELAY_MS);
    return true;
}

/**
 * @param {{guard?: boolean, onExitAttempt?: Function}} [options]
 *   guard - keep a spare history entry so Back on the guide asks before leaving (TV)
 */
export function initLayers(options) {
    guardEnabled = !!(options && options.guard);
    onExitAttempt = options && options.onExitAttempt;

    try {
        if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
        window.history.replaceState({ mytv: true, d: 0 }, '');
    } catch (_error) {
        // Sandboxed frame
    }

    // Track real input so pushState only happens with user activation
    const activate = (event) => {
        if (event.type === 'keydown') {
            const key = event.key;
            if (key === 'Escape' || key === 'Esc' || key === 'Backspace' || key === 'GoBack'
                || key === 'BrowserBack' || key === 'XF86Back'
                || event.keyCode === 461 || event.keyCode === 10009 || event.keyCode === 27 || event.keyCode === 8) {
                return;
            }
        }
        hasActivation = true;
        flushPending();
        armGuard();
    };
    ['keydown', 'mousedown', 'pointerup', 'touchend', 'click'].forEach((type) => {
        document.addEventListener(type, activate, true);
    });

    window.addEventListener('popstate', (event) => {
        const keyedPress = backTimer !== null;
        clearTimeout(backTimer);
        backTimer = null;
        hasActivation = false;
        if (Date.now() < ownPopUntil) {
            ownPopUntil = 0;
        } else if (!keyedPress) {
            lastPopAt = Date.now();
        }

        const data = event.state && event.state.mytv ? event.state : null;
        const depth = data ? data.d : 0;

        let count = 0;
        let cut = stack.length;
        for (let i = 0; i < stack.length; i += 1) {
            if (stack[i].pushed) count += 1;
            if (count > depth) {
                cut = i;
                break;
            }
        }
        if (cut < stack.length) {
            hideFrom(cut);
        } else if (!data || !data.guard) {
            // Landed on the bare root: the guard was used up
            guardArmed = false;
            if (guardEnabled && onExitAttempt && !stack.length) onExitAttempt();
        }
        if (data && data.guard) guardArmed = true;
    });
}
