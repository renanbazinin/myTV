// dom.js - Tiny DOM helpers shared by the UI modules

/**
 * Create an element.
 * @param {string} tag - Tag name with optional .classes, e.g. 'button.card.is-live'
 * @param {Object} [attrs] - Attributes; `text`, `html`, `on*` and `dataset` are special
 * @param {Array|Node|string} [children]
 * @returns {HTMLElement}
 */
export function h(tag, attrs, children) {
    const parts = tag.split('.');
    const el = document.createElement(parts[0] || 'div');
    if (parts.length > 1) {
        el.className = parts.slice(1).join(' ');
    }

    if (attrs) {
        Object.keys(attrs).forEach((key) => {
            const value = attrs[key];
            if (value === null || value === undefined || value === false) return;
            if (key === 'text') {
                el.textContent = value;
            } else if (key === 'html') {
                el.innerHTML = value;
            } else if (key === 'dataset') {
                Object.keys(value).forEach((dataKey) => {
                    el.dataset[dataKey] = value[dataKey];
                });
            } else if (key.indexOf('on') === 0 && typeof value === 'function') {
                el.addEventListener(key.slice(2).toLowerCase(), value);
            } else if (key === 'className') {
                el.className = el.className ? el.className + ' ' + value : value;
            } else if (value === true) {
                el.setAttribute(key, '');
            } else {
                el.setAttribute(key, String(value));
            }
        });
    }

    appendChildren(el, children);
    return el;
}

function appendChildren(el, children) {
    if (children === null || children === undefined || children === false) return;
    if (Array.isArray(children)) {
        children.forEach((child) => appendChildren(el, child));
        return;
    }
    el.appendChild(typeof children === 'string' ? document.createTextNode(children) : children);
}

/**
 * Inline SVG icon from the sprite in index.html
 * @param {string} name - Symbol id without the `i-` prefix
 * @param {string} [extraClass]
 */
export function icon(name, extraClass) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'icon' + (extraClass ? ' ' + extraClass : ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS(ns, 'use');
    use.setAttribute('href', '#i-' + name);
    use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#i-' + name);
    svg.appendChild(use);
    return svg;
}

/**
 * Swap the icon inside a button (keeps the button's other children)
 * @param {Element} button
 * @param {string} name
 */
export function setIcon(button, name) {
    if (!button) return;
    const current = button.querySelector('svg.icon');
    const next = icon(name);
    if (current) {
        button.replaceChild(next, current);
    } else {
        button.insertBefore(next, button.firstChild);
    }
}

export function $(selector, root) {
    return (root || document).querySelector(selector);
}

export function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
}

/**
 * Whether an element is rendered and not hidden
 * @param {Element} el
 */
export function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.closest('[hidden]')) return false;
    const rects = el.getClientRects();
    if (!rects.length) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
}

/**
 * Whether the event target is a text field where keys should type, not navigate
 * @param {EventTarget|null} target
 */
export function isTypingTarget(target) {
    if (!target || !(target instanceof Element)) return false;
    const tag = target.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') {
        const type = (target.getAttribute('type') || 'text').toLowerCase();
        return ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].indexOf(type) !== -1;
    }
    return !!target.isContentEditable;
}
