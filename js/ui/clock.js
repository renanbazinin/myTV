// clock.js - Wall clock shown in the guide and player (TV-style)

const elements = [];
let timer = null;

function render() {
    let text = '';
    try {
        text = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_error) {
        const now = new Date();
        text = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    }
    elements.forEach((el) => {
        if (el.textContent !== text) el.textContent = text;
    });
}

function schedule() {
    clearTimeout(timer);
    const now = new Date();
    // Tick right after the minute changes
    const wait = (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 50;
    timer = setTimeout(() => {
        render();
        schedule();
    }, wait);
}

/**
 * Keep these elements showing the current time
 * @param {Array<HTMLElement|null>} targets
 */
export function startClock(targets) {
    targets.forEach((el) => {
        if (el) elements.push(el);
    });
    render();
    schedule();
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            render();
            schedule();
        }
    });
}
