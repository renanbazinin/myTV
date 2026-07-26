// main.js - Application entry point for myTV

/**
 * Initialize the application when DOM is ready
 */
function bootApp() {
    initDomReferences();
    initUiEventListeners();
    initKeyboardListeners();
    start();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootApp, { once: true });
} else {
    bootApp();
}
