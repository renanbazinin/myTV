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
 * Update mute button icon to reflect current state
 */
function updateMuteButtonIcon() {
    const muteButton = document.getElementById('muteButton');
    if (!muteButton) return;
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

/**
 * Apply current volume and mute state to all active media elements
 */
function applyVolumeToMedia() {
    if (currentVideoElement) {
        currentVideoElement.volume = currentVolume;
        currentVideoElement.muted = isMuted;
    }
    if (currentAudioElement) {
        currentAudioElement.volume = currentVolume;
        currentAudioElement.muted = isMuted;
    }
}

/**
 * Set volume from slider value (0-100)
 */
function setVolume(value) {
    currentVolume = value / 100;
    localStorage.setItem('myTV_volume', String(currentVolume));

    if (value === 0 && !isMuted) {
        isMuted = true;
        localStorage.setItem('myTV_isMuted', 'true');
        updateMuteButtonIcon();
    } else if (value > 0 && isMuted) {
        isMuted = false;
        localStorage.setItem('myTV_isMuted', 'false');
        updateMuteButtonIcon();
    }

    applyVolumeToMedia();
}

/**
 * Toggle mute state for video and audio
 */
function toggleMute() {
    const volumeSlider = document.getElementById('volumeSlider');

    if (currentVideoElement || currentAudioElement) {
        isMuted = !isMuted;
        localStorage.setItem('myTV_isMuted', String(isMuted));

        if (isMuted) {
            if (volumeSlider) volumeSlider.value = 0;
        } else {
            if (currentVolume === 0) currentVolume = 1;
            if (volumeSlider) volumeSlider.value = currentVolume * 100;
        }

        applyVolumeToMedia();
        updateMuteButtonIcon();
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

    // Volume slider handler
    const volumeSlider = document.getElementById('volumeSlider');
    if (volumeSlider) {
        volumeSlider.value = isMuted ? 0 : currentVolume * 100;
        volumeSlider.addEventListener('input', function () {
            setVolume(parseInt(this.value, 10));
        });
    }

    // Set initial mute button icon from stored state
    updateMuteButtonIcon();

    // Back button click handler
    const backButton = document.getElementById('backButton');
    if (backButton) {
        backButton.addEventListener('click', function () {
            toggleSideMenu();
        });
    }
}
