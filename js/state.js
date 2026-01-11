// state.js - Global state management for myTV

// UI visibility state
let isPickerVisible = true;
let isMenuVisible = true;
let isFilterApplied = true;
let isMuted = true; // Start muted for autoplay compatibility

// Media element references
let currentVideoElement = null;
let currentAudioElement = null;

// HLS instance references
let currentHlsVideoInstance = null;
let currentHlsAudioInstance = null;

// Loading and monitoring
let loadingStatusElement = null;
let memoryCheckInterval = null;
let audioVideoSyncInterval = null;

// Channel input state (for numeric keyboard input)
let channelInput = [];
let channelInputTimer = null;

// DOM element references (initialized after DOM loads)
let sideMenu = null;
let contentArea = null;
let channelInputDisplay = null;
let channelInputSpans = [];

// Initialize DOM references
function initDomReferences() {
    sideMenu = document.getElementById('sideMenu');
    contentArea = document.getElementById('contentArea');
    channelInputDisplay = document.getElementById('channel-input-display');
    channelInputSpans = channelInputDisplay ? channelInputDisplay.querySelectorAll('span') : [];
}
