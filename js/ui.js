// ui.js - UI controls for myTV

/**
 * Toggle side menu visibility
 */
function toggleSideMenu() {
    if (isMenuVisible) {
        sideMenu.classList.add('hidden');
        contentArea.classList.add('expanded');
        isMenuVisible = false;
    } else {
        sideMenu.classList.remove('hidden');
        contentArea.classList.remove('expanded');
        isMenuVisible = true;
    }
}

/**
 * Update mute button visibility
 * @param {boolean} hidden - Whether to hide the button
 */
function updateMuteButtonVisibility(hidden) {
    const muteButton = document.getElementById('muteButton');
    if (muteButton) {
        muteButton.style.display = hidden ? 'none' : 'flex';
    }
}

/**
 * Toggle mute state for video and audio
 */
function toggleMute() {
    const muteButton = document.getElementById('muteButton');

    if (currentVideoElement || currentAudioElement) {
        isMuted = !isMuted;
        if (currentVideoElement) {
            currentVideoElement.muted = isMuted;
        }
        if (currentAudioElement) {
            currentAudioElement.muted = isMuted;
        }

        if (isMuted) {
            muteButton.textContent = '🔇';
            muteButton.classList.add('muted');
            muteButton.title = 'Unmute';
        } else {
            muteButton.textContent = '🔊';
            muteButton.classList.remove('muted');
            muteButton.title = 'Mute';
        }
    }
}

/**
 * Show channel picker and hide video
 */
function showPicker() {
    cleanupAllMedia();
    document.getElementById('channelPicker').style.display = 'grid';
    document.getElementById('videoContainer').style.display = 'none';
    document.getElementById('backButton').style.display = 'none';

    // Show side menu when going back to channels
    if (!isMenuVisible) {
        sideMenu.classList.remove('hidden');
        contentArea.classList.remove('expanded');
        isMenuVisible = true;
    }

    isPickerVisible = true;
}

/**
 * Hide channel picker
 */
function hidePicker() {
    document.getElementById('channelPicker').style.display = 'none';
    isPickerVisible = false;
}

/**
 * Toggle channel picker visibility
 */
function togglePicker() {
    if (isPickerVisible) {
        hidePicker();
    } else {
        showPicker();
    }
}

/**
 * Initialize UI event listeners
 */
function initUiEventListeners() {
    // Mute button click handler
    const muteButton = document.getElementById('muteButton');
    if (muteButton) {
        muteButton.addEventListener('click', toggleMute);
    }

    // Back button click handler
    const backButton = document.getElementById('backButton');
    if (backButton) {
        backButton.addEventListener('click', function () {
            toggleSideMenu();
        });
    }
}
