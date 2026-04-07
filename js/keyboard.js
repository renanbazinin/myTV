// keyboard.js - Keyboard shortcuts and numeric input for myTV

/**
 * Handle numeric keyboard input for channel selection
 * @param {string} digit - Single digit character (0-9)
 */
function handleNumericInput(digit) {
    if (!channelInputDisplay) return;

    if (channelInputTimer) {
        clearTimeout(channelInputTimer);
    }

    channelInput.push(digit);
    updateChannelInputDisplay();

    if (channelInput.length === 1) {
        channelInputTimer = setTimeout(() => {
            const channelNumber = parseInt(channelInput[0]);
            if (channelNumber > 0) {
                const channelIndex = channelNumber - 1;
                if (window.allChannels && window.allChannels[channelIndex]) {
                    const channel = window.allChannels[channelIndex];
                    showChannelInfoOverlay(channelNumber, channel.name);
                    playChannelFromMenu(channel.url, channel.name, channelIndex);
                }
            }
            resetChannelInput();
        }, 1500); // 1.5-second wait
    } else if (channelInput.length === 2) {
        const channelNumber = parseInt(channelInput.join(''));
        const channelIndex = channelNumber - 1;

        if (window.allChannels && window.allChannels[channelIndex]) {
            const channel = window.allChannels[channelIndex];
            showChannelInfoOverlay(channelNumber, channel.name);
            playChannelFromMenu(channel.url, channel.name, channelIndex);
        }
        setTimeout(resetChannelInput, 500);
    }
}

/**
 * Update on-screen channel input display
 */
function updateChannelInputDisplay() {
    if (!channelInputDisplay) return;
    channelInputDisplay.classList.remove('hidden');
    channelInputSpans[0].textContent = channelInput[0] || '_';
    channelInputSpans[1].textContent = channelInput[1] || '_';
}

/**
 * Reset channel input state
 */
function resetChannelInput() {
    if (!channelInputDisplay) return;
    channelInput = [];
    channelInputDisplay.classList.add('hidden');
    if (channelInputSpans.length > 1) {
        channelInputSpans[0].textContent = '_';
        channelInputSpans[1].textContent = '_';
    }
    if (channelInputTimer) {
        clearTimeout(channelInputTimer);
        channelInputTimer = null;
    }
}

/**
 * Toggle the keyboard shortcuts help modal
 */
function toggleHelpModal() {
    const modal = document.getElementById('helpModal');
    if (!modal) return;
    modal.classList.toggle('hidden');
}

/**
 * Close the keyboard shortcuts help modal
 */
function closeHelpModal() {
    const modal = document.getElementById('helpModal');
    if (modal) modal.classList.add('hidden');
}

/**
 * Switch channel by relative offset (wraps around)
 * @param {number} offset - +1 for next, -1 for previous
 */
function switchChannelRelative(offset) {
    if (!window.allChannels || window.allChannels.length === 0) return;
    if (currentChannelIndex < 0) return;

    const total = window.allChannels.length;
    const newIndex = ((currentChannelIndex + offset) % total + total) % total;
    const channel = window.allChannels[newIndex];
    showChannelInfoOverlay(newIndex + 1, channel.name);
    playChannelFromMenu(channel.url, channel.name, newIndex);
}

/**
 * Switch to the previously watched channel
 */
function switchToPreviousChannel() {
    if (previousChannelIndex < 0) return;
    if (!window.allChannels || !window.allChannels[previousChannelIndex]) return;

    const channel = window.allChannels[previousChannelIndex];
    showChannelInfoOverlay(previousChannelIndex + 1, channel.name);
    playChannelFromMenu(channel.url, channel.name, previousChannelIndex);
}

/**
 * Show channel info overlay briefly
 * @param {number} number - Channel number (1-based)
 * @param {string} name - Channel name
 */
function showChannelInfoOverlay(number, name) {
    const overlay = document.getElementById('channel-info-overlay');
    if (!overlay) return;

    overlay.querySelector('.channel-info-number').textContent = number;
    overlay.querySelector('.channel-info-name').textContent = name;
    overlay.classList.remove('hidden');
    overlay.classList.remove('fade-out');

    clearTimeout(overlay._fadeTimer);
    overlay._fadeTimer = setTimeout(() => {
        overlay.classList.add('fade-out');
        setTimeout(() => overlay.classList.add('hidden'), 500);
    }, 2000);
}

/**
 * Initialize keyboard event listeners
 */
function initKeyboardListeners() {
    document.addEventListener('keydown', function (e) {
        if (e.key === '?') {
            toggleHelpModal();
            return;
        } else if (e.key === 'Escape') {
            const helpModal = document.getElementById('helpModal');
            if (helpModal && !helpModal.classList.contains('hidden')) {
                closeHelpModal();
                return;
            }
            if (!isPickerVisible) {
                showPicker();
            }
        } else if (e.key === 'h' || e.key === 'H') {
            togglePicker();
        } else if (e.key === 'ArrowDown' && !isPickerVisible) {
            e.preventDefault();
            switchChannelRelative(1);
        } else if (e.key === 'ArrowUp' && !isPickerVisible) {
            e.preventDefault();
            switchChannelRelative(-1);
        } else if (e.key === 'Backspace' && !isPickerVisible) {
            e.preventDefault();
            switchToPreviousChannel();
        } else if (e.key >= '0' && e.key <= '9') {
            handleNumericInput(e.key);
        }
    });

    // Help button click
    const helpButton = document.getElementById('helpButton');
    if (helpButton) {
        helpButton.addEventListener('click', toggleHelpModal);
    }

    // Help modal backdrop click to close
    const helpModal = document.getElementById('helpModal');
    if (helpModal) {
        helpModal.addEventListener('click', function (e) {
            if (e.target === helpModal) {
                closeHelpModal();
            }
        });
        // Close button inside modal
        const closeBtn = helpModal.querySelector('.help-modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeHelpModal);
        }
    }
}
