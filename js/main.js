// main.js - Application entry point for myTV

/**
 * Initialize the application when DOM is ready
 */
window.onload = function () {
    // Initialize DOM references from state.js
    initDomReferences();

    // Initialize UI event listeners
    initUiEventListeners();

    // Initialize keyboard listeners
    initKeyboardListeners();

    // Start loading channels
    start();
};
