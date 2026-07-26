// state.js - Global state management for myTV

// UI visibility state
let isPickerVisible = true;
let isMenuVisible = false;
let isFilterApplied = true;
let isMuted = localStorage.getItem('myTV_isMuted') === 'true';
let currentVolume = localStorage.getItem('myTV_volume') !== null
    ? parseFloat(localStorage.getItem('myTV_volume'))
    : 0.6;

// Browse / filter state
let currentSearchQuery = '';
let currentCategory = 'All';
let availableCategories = ['All'];

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
let volumePersistTimer = null;
let toastTimer = null;
let chromeIdleTimer = null;
const CHROME_IDLE_MS = 3000;

// Channel navigation state
let currentChannelIndex = -1;
let previousChannelIndex = -1;

// Channel input state (for numeric keyboard input)
let channelInput = [];
let channelInputTimer = null;

// DOM element references (initialized after DOM loads)
let sideMenu = null;
let contentArea = null;
let channelInputDisplay = null;
let channelInputSpans = [];
let drawerScrim = null;
let menuButton = null;
let closeMenuButton = null;
let playerBar = null;
let moreSheet = null;

/**
 * Whether the viewport should use the mobile/drawer pattern.
 */
function isMobileLayout() {
    return window.matchMedia('(max-width: 1023px)').matches;
}

/**
 * Initialize DOM references
 */
function initDomReferences() {
    sideMenu = document.getElementById('sideMenu');
    contentArea = document.getElementById('contentArea');
    channelInputDisplay = document.getElementById('channel-input-display');
    channelInputSpans = channelInputDisplay ? channelInputDisplay.querySelectorAll('span') : [];
    drawerScrim = document.getElementById('drawerScrim');
    menuButton = document.getElementById('menuButton');
    closeMenuButton = document.getElementById('closeMenuButton');
    playerBar = document.getElementById('playerBar');
    moreSheet = document.getElementById('moreSheet');
}
