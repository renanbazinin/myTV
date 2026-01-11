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
 * Initialize keyboard event listeners
 */
function initKeyboardListeners() {
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            if (!isPickerVisible) {
                showPicker();
            }
        } else if (e.key === 'h' || e.key === 'H') {
            togglePicker();
        } else if (e.key >= '0' && e.key <= '9') {
            handleNumericInput(e.key);
        }
    });
}
