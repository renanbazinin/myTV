// ui.js - UI controls for myTV

/**
 * Sync menu button / scrim / body classes with drawer state
 */
function syncMenuUi() {
    const open = isMenuVisible;

    if (sideMenu) {
        sideMenu.classList.toggle('hidden', !open);
        sideMenu.classList.toggle('open', open);
        sideMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
        if (open) {
            sideMenu.removeAttribute('inert');
        } else {
            sideMenu.setAttribute('inert', '');
        }
    }

    if (contentArea) {
        contentArea.classList.toggle('expanded', !open || isMobileLayout());
    }

    if (drawerScrim) {
        const showScrim = open && isMobileLayout();
        drawerScrim.hidden = !showScrim;
        drawerScrim.setAttribute('aria-hidden', showScrim ? 'false' : 'true');
    }

    if (menuButton) {
        menuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
        menuButton.setAttribute('aria-label', open ? 'Close channel categories' : 'Open channel categories');
    }

    document.body.classList.toggle('desktop-menu-open', open && !isMobileLayout());
}

/**
 * Open the side menu / drawer
 */
function openSideMenu() {
    isMenuVisible = true;
    syncMenuUi();
}

/**
 * Close the side menu / drawer
 */
function closeSideMenu() {
    isMenuVisible = false;
    syncMenuUi();
}

/**
 * Toggle side menu visibility
 */
function toggleSideMenu() {
    if (isMenuVisible) {
        closeSideMenu();
    } else {
        openSideMenu();
    }
}

/**
 * Update mute button visibility
 * @param {boolean} hidden - Whether to hide the button
 */
function updateMuteButtonVisibility(hidden) {
    const muteButton = document.getElementById('muteButton');
    if (muteButton) {
        muteButton.hidden = !!hidden;
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
        muteButton.setAttribute('aria-label', 'Unmute');
        muteButton.setAttribute('aria-pressed', 'true');
    } else {
        muteButton.textContent = '🔊';
        muteButton.classList.remove('muted');
        muteButton.title = 'Mute';
        muteButton.setAttribute('aria-label', 'Mute');
        muteButton.setAttribute('aria-pressed', 'false');
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
 * Persist volume shortly after the user stops dragging
 */
function persistVolumeSoon() {
    if (volumePersistTimer) {
        clearTimeout(volumePersistTimer);
    }
    volumePersistTimer = setTimeout(() => {
        localStorage.setItem('myTV_volume', String(currentVolume));
        localStorage.setItem('myTV_isMuted', String(isMuted));
        volumePersistTimer = null;
    }, 180);
}

/**
 * Sync both volume sliders to the current value
 */
function syncVolumeSliders() {
    const value = isMuted ? 0 : Math.round(currentVolume * 100);
    const mainSlider = document.getElementById('volumeSlider');
    const sheetSlider = document.getElementById('volumeSliderSheet');
    if (mainSlider) {
        mainSlider.value = String(value);
        mainSlider.setAttribute('aria-valuenow', String(value));
    }
    if (sheetSlider) {
        sheetSlider.value = String(value);
    }
}

/**
 * Set volume from slider value (0-100)
 */
function setVolume(value) {
    const numeric = Number(value);
    currentVolume = Math.max(0, Math.min(100, numeric)) / 100;

    if (numeric === 0 && !isMuted) {
        isMuted = true;
        updateMuteButtonIcon();
    } else if (numeric > 0 && isMuted) {
        isMuted = false;
        updateMuteButtonIcon();
    }

    applyVolumeToMedia();
    syncVolumeSliders();
    persistVolumeSoon();
}

/**
 * Toggle mute state for video and audio
 */
function toggleMute() {
    isMuted = !isMuted;
    localStorage.setItem('myTV_isMuted', String(isMuted));

    if (isMuted) {
        // keep currentVolume for restore
    } else if (currentVolume === 0) {
        currentVolume = 0.6;
    }

    applyVolumeToMedia();
    updateMuteButtonIcon();
    syncVolumeSliders();
}

/**
 * Clear the playback chrome idle timer
 */
function clearChromeIdleTimer() {
    if (chromeIdleTimer) {
        clearTimeout(chromeIdleTimer);
        chromeIdleTimer = null;
    }
}

/**
 * Reveal playback controls (header + player bar)
 */
function showPlaybackChrome() {
    document.body.classList.remove('chrome-idle');
    if (playerBar) {
        playerBar.setAttribute('aria-hidden', 'false');
    }
}

/**
 * Hide playback controls after idle
 */
function hidePlaybackChrome() {
    if (!document.body.classList.contains('is-playing')) return;
    if (moreSheet && !moreSheet.hidden) return;
    const helpModal = document.getElementById('helpModal');
    if (helpModal && !helpModal.classList.contains('hidden')) return;

    document.body.classList.add('chrome-idle');
    if (playerBar) {
        playerBar.setAttribute('aria-hidden', 'true');
    }
}

/**
 * Show chrome now, then auto-hide after a few idle seconds
 */
function bumpPlaybackChrome() {
    if (!document.body.classList.contains('is-playing')) return;
    showPlaybackChrome();
    clearChromeIdleTimer();
    chromeIdleTimer = setTimeout(hidePlaybackChrome, CHROME_IDLE_MS);
}

/**
 * Show / hide playback chrome
 * @param {boolean} playing
 */
function setPlaybackChrome(playing) {
    document.body.classList.toggle('is-playing', playing);

    const backButton = document.getElementById('backButton');
    const videoContainer = document.getElementById('videoContainer');

    if (backButton) {
        backButton.hidden = !playing;
    }
    if (videoContainer) {
        videoContainer.hidden = !playing;
    }
    if (playerBar) {
        playerBar.hidden = !playing;
    }

    if (playing) {
        bumpPlaybackChrome();
    } else {
        clearChromeIdleTimer();
        document.body.classList.remove('chrome-idle');
        if (playerBar) {
            playerBar.setAttribute('aria-hidden', 'true');
        }
    }
}

/**
 * Show channel picker and hide video
 */
function showPicker() {
    cleanupAllMedia();
    closeMoreSheet();

    const channelPicker = document.getElementById('channelPicker');
    if (channelPicker) {
        channelPicker.hidden = false;
        if (!channelPicker.children.length && window.allChannels) {
            renderFilteredChannels();
        }
    }

    setPlaybackChrome(false);
    isPickerVisible = true;

    // Keep desktop sidebar open; close overlay drawer on mobile after leaving playback
    if (!isMobileLayout()) {
        openSideMenu();
    } else {
        closeSideMenu();
    }
}

/**
 * Hide channel picker
 */
function hidePicker() {
    const channelPicker = document.getElementById('channelPicker');
    if (channelPicker) {
        channelPicker.hidden = true;
    }
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
 * Open overflow options sheet
 */
function openMoreSheet() {
    if (!moreSheet) return;
    moreSheet.hidden = false;
    const moreButton = document.getElementById('moreButton');
    if (moreButton) {
        moreButton.setAttribute('aria-expanded', 'true');
    }
    syncVolumeSliders();
}

/**
 * Close overflow options sheet
 */
function closeMoreSheet() {
    if (!moreSheet) return;
    moreSheet.hidden = true;
    const moreButton = document.getElementById('moreButton');
    if (moreButton) {
        moreButton.setAttribute('aria-expanded', 'false');
    }
}

/**
 * Initialize UI event listeners
 */
function initUiEventListeners() {
    const muteButton = document.getElementById('muteButton');
    if (muteButton) {
        muteButton.addEventListener('click', toggleMute);
    }

    const volumeSlider = document.getElementById('volumeSlider');
    if (volumeSlider) {
        volumeSlider.addEventListener('input', function () {
            setVolume(parseInt(this.value, 10));
        });
    }

    const volumeSliderSheet = document.getElementById('volumeSliderSheet');
    if (volumeSliderSheet) {
        volumeSliderSheet.addEventListener('input', function () {
            setVolume(parseInt(this.value, 10));
        });
    }

    updateMuteButtonIcon();
    syncVolumeSliders();

    const backButton = document.getElementById('backButton');
    if (backButton) {
        backButton.addEventListener('click', function () {
            showPicker();
        });
    }

    if (menuButton) {
        menuButton.addEventListener('click', toggleSideMenu);
    }

    if (closeMenuButton) {
        closeMenuButton.addEventListener('click', closeSideMenu);
    }

    if (drawerScrim) {
        drawerScrim.addEventListener('click', closeSideMenu);
    }

    const browseChannelsButton = document.getElementById('browseChannelsButton');
    if (browseChannelsButton) {
        browseChannelsButton.addEventListener('click', showPicker);
    }

    const prevChannelButton = document.getElementById('prevChannelButton');
    if (prevChannelButton) {
        prevChannelButton.addEventListener('click', function () {
            if (typeof switchChannelRelative === 'function') {
                switchChannelRelative(-1);
            }
        });
    }

    const nextChannelButton = document.getElementById('nextChannelButton');
    if (nextChannelButton) {
        nextChannelButton.addEventListener('click', function () {
            if (typeof switchChannelRelative === 'function') {
                switchChannelRelative(1);
            }
        });
    }

    const moreButton = document.getElementById('moreButton');
    if (moreButton) {
        moreButton.addEventListener('click', openMoreSheet);
    }

    if (moreSheet) {
        moreSheet.addEventListener('click', function (event) {
            if (event.target === moreSheet) {
                closeMoreSheet();
            }
        });
        const closeBtn = moreSheet.querySelector('.more-sheet-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeMoreSheet);
        }
    }

    const moreHelpButton = document.getElementById('moreHelpButton');
    if (moreHelpButton) {
        moreHelpButton.addEventListener('click', function () {
            closeMoreSheet();
            if (typeof toggleHelpModal === 'function') {
                toggleHelpModal();
            }
        });
    }

    const channelSearch = document.getElementById('channelSearch');
    if (channelSearch) {
        channelSearch.addEventListener('input', function () {
            currentSearchQuery = this.value || '';
            if (typeof renderFilteredChannels === 'function') {
                renderFilteredChannels();
            }
        });
    }

    // Reveal compact playback controls on interaction, then hide after idle
    let lastChromeBump = 0;
    const revealChrome = () => {
        const now = Date.now();
        if (now - lastChromeBump < 120) return;
        lastChromeBump = now;
        bumpPlaybackChrome();
    };
    document.addEventListener('pointerdown', revealChrome, { passive: true });
    document.addEventListener('mousemove', revealChrome, { passive: true });
    document.addEventListener('touchstart', revealChrome, { passive: true });
    document.addEventListener('keydown', revealChrome);

    // Initial menu state: open on desktop, closed on mobile
    if (isMobileLayout()) {
        closeSideMenu();
    } else {
        openSideMenu();
    }

    window.addEventListener('resize', function () {
        // Keep desktop sidebar open; ensure mobile drawer closes on breakpoint flip
        if (isMobileLayout() && isMenuVisible && isPickerVisible) {
            // leave as-is if user opened it
            syncMenuUi();
        } else if (!isMobileLayout()) {
            if (!isMenuVisible && isPickerVisible) {
                openSideMenu();
            } else {
                syncMenuUi();
            }
        } else {
            syncMenuUi();
        }
    });
}
