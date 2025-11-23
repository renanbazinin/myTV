let isPickerVisible = true;
let isMenuVisible = true;
const sideMenu = document.getElementById('sideMenu');
const contentArea = document.getElementById('contentArea'); let isFilterApplied = true; let currentVideoElement = null;
let isMuted = true; // Start muted for autoplay compatibility
let currentAudioElement = null;
let audioVideoSyncInterval = null;
let currentHlsVideoInstance = null;
let currentHlsAudioInstance = null;
let loadingStatusElement = null;
let memoryCheckInterval = null;

function showLoadingMessage(message = 'Loading buffer...') {
  const container = document.getElementById('videoContainer');
  if (!container) return;

  if (!loadingStatusElement) {
    loadingStatusElement = document.createElement('div');
    loadingStatusElement.className = 'loading-status-overlay';
    loadingStatusElement.style.position = 'absolute';
    loadingStatusElement.style.top = '50%';
    loadingStatusElement.style.left = '50%';
    loadingStatusElement.style.transform = 'translate(-50%, -50%)';
    loadingStatusElement.style.padding = '0.85rem 1.5rem';
    loadingStatusElement.style.borderRadius = '999px';
    loadingStatusElement.style.background = 'rgba(15, 15, 15, 0.75)';
    loadingStatusElement.style.color = '#fff';
    loadingStatusElement.style.fontSize = '1rem';
    loadingStatusElement.style.fontWeight = '600';
    loadingStatusElement.style.letterSpacing = '0.02em';
    loadingStatusElement.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.35)';
    loadingStatusElement.style.zIndex = '10';
    loadingStatusElement.style.display = 'none';
    loadingStatusElement.style.alignItems = 'center';
    loadingStatusElement.style.justifyContent = 'center';
    loadingStatusElement.style.gap = '0.65rem';
    loadingStatusElement.style.pointerEvents = 'none';

    const spinner = document.createElement('span');
    spinner.className = 'loading-spinner';
    spinner.style.width = '1rem';
    spinner.style.height = '1rem';
    spinner.style.border = '2px solid rgba(255, 255, 255, 0.2)';
    spinner.style.borderTopColor = '#fff';
    spinner.style.borderRadius = '50%';
    spinner.style.animation = 'loading-spin 1s linear infinite';

    const textNode = document.createElement('span');
    textNode.className = 'loading-text';

    loadingStatusElement.appendChild(spinner);
    loadingStatusElement.appendChild(textNode);
  }

  const textElement = loadingStatusElement.querySelector('.loading-text');
  if (textElement) {
    textElement.textContent = message;
  } else {
    loadingStatusElement.textContent = message;
  }

  if (loadingStatusElement.parentElement !== container) {
    container.appendChild(loadingStatusElement);
  }

  loadingStatusElement.style.display = 'flex';
}

function hideLoadingMessage() {
  if (loadingStatusElement) {
    loadingStatusElement.style.display = 'none';
  }
}

// Inject keyframes for spinner if not already present
(function ensureLoadingSpinnerStyles() {
  const existing = document.getElementById('loading-spinner-styles');
  if (existing) return;

  const style = document.createElement('style');
  style.id = 'loading-spinner-styles';
  style.textContent = `
        @keyframes loading-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `;
  document.head.appendChild(style);
})();

function normalizePlaybackOptions(options) {
  const defaults = {
    headers: null,
    initialLiveBufferSeconds: 0,
    postReadyDelayMs: 0,
    loadingMessage: null
  };

  if (!options) {
    return defaults;
  }

  if (typeof options !== 'object' || Array.isArray(options)) {
    return defaults;
  }

  const recognizedKeys = ['headers', 'initialLiveBufferSeconds', 'postReadyDelayMs', 'loadingMessage'];
  const hasRecognizedKey = recognizedKeys.some(key => Object.prototype.hasOwnProperty.call(options, key));

  if (hasRecognizedKey) {
    return {
      headers: options.headers || null,
      initialLiveBufferSeconds: typeof options.initialLiveBufferSeconds === 'number' ? options.initialLiveBufferSeconds : 0,
      postReadyDelayMs: typeof options.postReadyDelayMs === 'number' ? options.postReadyDelayMs : 0,
      loadingMessage: typeof options.loadingMessage === 'string' ? options.loadingMessage : null
    };
  }

  return {
    ...defaults,
    headers: options
  };
}

function clearAudioVideoSyncInterval() {
  if (audioVideoSyncInterval) {
    ;
    clearInterval(audioVideoSyncInterval);
    audioVideoSyncInterval = null;
  }
}

function startMemoryMonitor() {
  // Only in Chrome/Edge with memory API
  if (!performance.memory) return;

  clearMemoryMonitor();

  memoryCheckInterval = setInterval(() => {
    const memoryMB = performance.memory.usedJSHeapSize / (1024 * 1024);
    const limitMB = performance.memory.jsHeapSizeLimit / (1024 * 1024);
    const usagePercent = (memoryMB / limitMB) * 100;

    console.log(`Memory: ${memoryMB.toFixed(0)}MB / ${limitMB.toFixed(0)}MB (${usagePercent.toFixed(1)}%)`);

    // If memory usage exceeds 80%, force buffer cleanup
    if (usagePercent > 80) {
      console.warn('High memory usage detected! Triggering buffer cleanup...');

      // Force HLS to drop old buffers
      if (currentHlsVideoInstance) {
        try {
          currentHlsVideoInstance.trigger(Hls.Events.BUFFER_FLUSHING, {
            startOffset: 0,
            endOffset: Number.POSITIVE_INFINITY
          });
        } catch (e) {
          console.warn('Failed to flush video buffer:', e);
        }
      }

      if (currentHlsAudioInstance) {
        try {
          currentHlsAudioInstance.trigger(Hls.Events.BUFFER_FLUSHING, {
            startOffset: 0,
            endOffset: Number.POSITIVE_INFINITY
          });
        } catch (e) {
          console.warn('Failed to flush audio buffer:', e);
        }
      }
    }

    // If still > 90%, show warning to user
    if (usagePercent > 90) {
      showLoadingMessage('⚠️ High memory usage - Consider refreshing page');
    }
  }, 30000); // Check every 30 seconds
}

function clearMemoryMonitor() {
  if (memoryCheckInterval) {
    clearInterval(memoryCheckInterval);
    memoryCheckInterval = null;
  }
}

function stopCurrentAudioElement() {
  if (!currentAudioElement) return;

  try {
    currentAudioElement.pause();
  } catch (error) {
    console.warn('Failed to pause auxiliary audio stream:', error);
  }

  try {
    currentAudioElement.playbackRate = 1;
  } catch (_error) {
    // No-op
  }

  try {
    currentAudioElement.removeAttribute('src');
    currentAudioElement.load();
  } catch (error) {
    console.warn('Failed to reset auxiliary audio stream:', error);
  }

  if (currentAudioElement.parentElement) {
    currentAudioElement.parentElement.removeChild(currentAudioElement);
  }

  currentAudioElement = null;
}

function stopCurrentVideoElement() {
  if (!currentVideoElement) return;

  try {
    currentVideoElement.pause();
  } catch (error) {
    console.warn('Failed to pause video element:', error);
  }

  try {
    currentVideoElement.removeAttribute('src');
    currentVideoElement.load();
  } catch (error) {
    console.warn('Failed to reset video element:', error);
  }

  if (currentVideoElement.parentElement) {
    currentVideoElement.parentElement.removeChild(currentVideoElement);
  }

  currentVideoElement = null;
}

// Helper function to properly cleanup HLS instances
function cleanupHlsInstance(hlsInstance) {
  if (!hlsInstance) return;

  try {
    // Remove all event listeners first
    hlsInstance.off(Hls.Events.ERROR);
    hlsInstance.off(Hls.Events.MANIFEST_PARSED);
    hlsInstance.off(Hls.Events.FRAG_LOADED);

    // Detach media before destroying
    if (hlsInstance.media) {
      hlsInstance.detachMedia();
    }

    // Destroy instance (cleans up internal buffers)
    hlsInstance.destroy();
  } catch (error) {
    console.warn('Failed to cleanup HLS instance:', error);
  }
}

function cleanupAllMedia() {
  hideLoadingMessage();
  clearAudioVideoSyncInterval();
  clearMemoryMonitor();

  // Destroy HLS instances with proper cleanup
  if (currentHlsVideoInstance) {
    cleanupHlsInstance(currentHlsVideoInstance);
    currentHlsVideoInstance = null;
  }

  if (currentHlsAudioInstance) {
    cleanupHlsInstance(currentHlsAudioInstance);
    currentHlsAudioInstance = null;
  }

  stopCurrentAudioElement();
  stopCurrentVideoElement();
}

// For two-digit channel input
let channelInput = [];
let channelInputTimer = null;
const channelInputDisplay = document.getElementById('channel-input-display');
const channelInputSpans = channelInputDisplay ? channelInputDisplay.querySelectorAll('span') : [];

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

function updateMuteButtonVisibility(hidden) {
  const muteButton = document.getElementById('muteButton');
  if (muteButton) {
    muteButton.style.display = hidden ? 'none' : 'flex';
  }
}

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

// Add event listener for mute button
document.getElementById('muteButton').addEventListener('click', toggleMute);

function playStream(url) {
  cleanupAllMedia();
  return new Promise((resolve, reject) => {
    const videoElement = document.createElement('video');
    videoElement.className = 'video-element';
    videoElement.controls = true;
    videoElement.autoplay = true;
    videoElement.muted = false; // Start unmuted so clicking a channel auto-plays with sound
    isMuted = false;

    // Store reference to current video element
    currentVideoElement = videoElement;
    currentAudioElement = null;

    const container = document.getElementById('videoContainer');
    const channelPickerElement = document.getElementById('channelPicker');
    const backButton = document.getElementById('backButton');
    const muteButton = document.getElementById('muteButton');

    // Check if HLS.js is supported
    if (Hls.isSupported()) {
      // Configure HLS with aggressive buffer limits to prevent memory leaks
      const hlsConfig = {
        enableWorker: true,
        lowLatencyMode: false,

        // Live stream synchronization
        liveSyncDuration: 6,
        liveMaxLatencyDuration: 18,

        // CRITICAL: Buffer management to prevent memory leaks
        maxBufferLength: 30,              // Keep max 30 seconds buffered
        maxMaxBufferLength: 60,           // Hard limit: never exceed 60 seconds
        backBufferLength: 10,             // Remove fragments >10sec behind playhead

        // Fragment loading optimization
        maxBufferSize: 60 * 1000 * 1000,  // 60 MB max buffer size
        maxBufferHole: 0.5,

        // Reduce manifest polling
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 3,
        levelLoadingTimeOut: 10000,

        // Fragment retry limits
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 3
      };

      const hls = new Hls(hlsConfig);
      currentHlsVideoInstance = hls;
      hls.loadSource(url);
      hls.attachMedia(videoElement);
      hls.on(Hls.Events.MANIFEST_PARSED, function () {
        videoElement.play()
          .then(() => {
            hideLoadingMessage();
            startMemoryMonitor();
            resolve();
          })
          .catch(error => {
            hideLoadingMessage();
            reject(error);
          });
      });
      hls.on(Hls.Events.ERROR, function (event, data) {
        if (data.fatal) {
          cleanupHlsInstance(hls);
          if (currentHlsVideoInstance === hls) {
            currentHlsVideoInstance = null;
          }
          hideLoadingMessage();
          reject(new Error('HLS playback error: ' + (data.details || 'unknown')));
        }
      });
    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      // If native HLS is supported
      videoElement.src = url;
      videoElement.addEventListener('loadedmetadata', function () {
        videoElement.play()
          .then(() => {
            hideLoadingMessage();
            resolve();
          })
          .catch(error => {
            hideLoadingMessage();
            reject(error);
          });
      });
    } else {
      hideLoadingMessage();
      reject(new Error('HLS is not supported'));
    }

    if (container) {
      container.innerHTML = '';
      container.appendChild(videoElement);
      container.style.display = 'block';
    }
    if (channelPickerElement) {
      channelPickerElement.style.display = 'none';
    }
    if (backButton) {
      backButton.style.display = 'block';
    }

    // Show mute button and update its state to unmuted
    updateMuteButtonVisibility(false);
    if (muteButton) {
      muteButton.textContent = '🔊';
      muteButton.classList.remove('muted');
      muteButton.title = 'Mute';
    }

    showLoadingMessage();
    isPickerVisible = false;
  });
}

// Function to play channel from side menu
function playChannelFromMenu(url, name, index) {
  // Hide side menu when channel is selected
  if (isMenuVisible) {
    toggleSideMenu();
  }

  // Update active channel in menu
  document.querySelectorAll('.channel-menu-item').forEach(item => item.classList.remove('active'));
  document.querySelector(`[data-index="${index}"]`).classList.add('active');

  if (url.includes('php?m3u8Old')) {
    const iframe = document.createElement('iframe');
    iframe.src = 'https://www.mako.co.il/AjaxPage?jspName=embedHTML5video.jsp&galleryChannelId=7c5076a9b8757810VgnVCM100000700a10acRCRD&videoChannelId=d1d6f5dfc8517810VgnVCM100000700a10acRCRD&vcmid=1e2258089b67f510VgnVCM2000002a0c10acRCRD';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.allowFullscreen = true;
    iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen');

    document.getElementById('videoContainer').innerHTML = '';
    document.getElementById('videoContainer').appendChild(iframe);
    document.getElementById('videoContainer').style.display = 'block';

    // Hide channel picker and show back button
    document.getElementById('channelPicker').style.display = 'none';
    document.getElementById('backButton').style.display = 'block';
    isPickerVisible = false;
  } else {
    if (name === '12-kanal-il') {
      const vlcHeaders = {
        'User-Agent': 'VLC/3.0.11',
        'Accept': '*/*'
      };
      // Detect Firefox - it doesn't support HEVC codec
      const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
      let streamUrl = url;
      if (isFirefox) {
        // For Firefox: remove _hevc from path and fmp4 parameter
        streamUrl = url.replace(/_hevc/g, '').replace(/[&?]fmp4/g, '');
      }
      playStream(streamUrl, vlcHeaders);
    } else if (name === '13-kanal-il1') {
      const vlcHeaders = {
        'User-Agent': 'VLC/3.0.11',
        'Accept': '*/*'
      };
      playStream(url, vlcHeaders);
    } else if (name === '13-kanal-il') {
      const vlcHeaders = {
        'User-Agent': 'VLC/3.0.11',
        'Accept': '*/*'
      };
      // Detect Firefox - it doesn't support HEVC codec
      const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
      let streamUrl = url;
      if (isFirefox) {
        // For Firefox: remove _hevc from path and fmp4 parameter
        streamUrl = url.replace(/_hevc/g, '').replace(/[&?]fmp4/g, '');
      }
      playStream(streamUrl, vlcHeaders);
    } else {
      playStream(url);
    }
  }
} function createButton(name, logo, url, groupTitle) {
  console.log("groupTitle=" + groupTitle);
  console.log("isFilterApplied=" + isFilterApplied);

  // Remove the filtering logic from createButton since it's now handled in displayChannels
  var button = document.createElement('button');
  button.className = 'channel-button';

  // Create image element
  const img = document.createElement('img');
  img.src = logo;
  img.alt = name;
  img.onerror = function () {
    // Fallback if image fails to load
    this.style.display = 'none';
    button.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 80px; background: var(--glass-bg); border-radius: 12px; margin-bottom: 0.5rem; font-size: 2rem;">📺</div>' + name;
  };

  button.appendChild(img);

  // Add channel name
  const nameDiv = document.createElement('div');
  nameDiv.textContent = name;
  nameDiv.style.marginTop = '0.5rem';
  nameDiv.style.fontSize = '0.85rem';
  nameDiv.style.fontWeight = '500';
  nameDiv.style.textAlign = 'center';
  nameDiv.style.lineHeight = '1.2';
  button.appendChild(nameDiv);
  button.addEventListener('click', function () {
    // Hide side menu when channel is selected
    if (isMenuVisible) {
      toggleSideMenu();
    }

    if (url.includes('php?m3u8')) {
      const iframe = document.createElement('iframe');
      iframe.src = 'https://www.mako.co.il/AjaxPage?jspName=embedHTML5video.jsp&galleryChannelId=7c5076a9b8757810VgnVCM100000700a10acRCRD&videoChannelId=d1d6f5dfc8517810VgnVCM100000700a10acRCRD&vcmid=1e2258089b67f510VgnVCM2000002a0c10acRCRD';
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      iframe.allowFullscreen = true;
      iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen');
      document.getElementById('videoContainer').innerHTML = '';
      document.getElementById('videoContainer').appendChild(iframe);
      document.getElementById('videoContainer').style.display = 'block';

      // Hide channel picker and show back button
      document.getElementById('channelPicker').style.display = 'none';
      document.getElementById('backButton').style.display = 'block';
      isPickerVisible = false;
    } else {
      if (name === '12-kanal-il') {
        // Detect Firefox - it doesn't support HEVC codec
        const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
        let streamUrl = url;
        if (isFirefox) {
          // For Firefox: remove _hevc from path and fmp4 parameter
          streamUrl = url.replace(/_hevc/g, '').replace(/[&?]fmp4/g, '');
        }
        playStream(streamUrl);
      } else if (name === '13-kanal-il') {
        // Detect Firefox - it doesn't support HEVC codec
        const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
        let streamUrl = url;
        if (isFirefox) {
          // For Firefox: remove _hevc from path and fmp4 parameter
          streamUrl = url.replace(/_hevc/g, '').replace(/[&?]fmp4/g, '');
        }
        playStream(streamUrl);
      } else {
        playStream(url);
      }
    }
  });

  return button;
} function showPicker() {
  hideLoadingMessage();
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
} function hidePicker() {
  document.getElementById('channelPicker').style.display = 'none';
  isPickerVisible = false;
}

function togglePicker() {
  if (isPickerVisible) {
    hidePicker();
  } else {
    showPicker();
  }
}    // Event listeners
document.getElementById('backButton').addEventListener('click', function () {
  // Back button now just toggles the side menu like Hide Menu button
  toggleSideMenu();
}); function start() {
  const channelPicker = document.getElementById('channelPicker');
  const sideMenu = document.getElementById('sideMenu');
  channelPicker.innerHTML = '<div class="loading">Loading channels...</div>';

  fetch('https://raw.githubusercontent.com/renanbazinin/myM3U/main/directLiveNamesDiffandEPG1.m3u')
    .then(response => response.text())
    .then(data => {
      channelPicker.innerHTML = '';

      // Parse channels and collect categories
      const lines = data.split(/\r?\n/);
      const channels = [];
      const categories = new Set();
      let currentChannel = {};

      lines.forEach(line => {
        if (line.startsWith('#EXTINF:-1')) {
          if (currentChannel.name && currentChannel.logo && currentChannel.url) {
            channels.push(currentChannel);
            currentChannel = {};
          }
          const nameMatch = line.match(/tvg-id="([^"]+)"/);
          const logoMatch = line.match(/tvg-logo="([^"]+)"/);
          const groupTitleMatch = line.match(/group-title="([^"]+)"/);
          if (nameMatch && logoMatch) {
            currentChannel.name = nameMatch[1];
            currentChannel.logo = logoMatch[1];
            currentChannel.groupTitle = groupTitleMatch ? groupTitleMatch[1] : 'Other';
            categories.add(currentChannel.groupTitle);
          }
        } else if (line.trim() !== '' && !line.startsWith('#')) {
          currentChannel.url = line;
        }
      });

      // Add remaining channel if exists
      if (currentChannel.name && currentChannel.logo && currentChannel.url) {
        channels.push(currentChannel);
        categories.add(currentChannel.groupTitle);
      }          // Populate side menu with channels directly
      const channelMenuContent = channels.map((channel, index) =>
        `<div class="channel-menu-item" onclick="playChannelFromMenu('${channel.url}', '${channel.name}', ${index})" data-index="${index}">
              <img src="${channel.logo}" alt="${channel.name}" onerror="this.style.display='none'" style="width: 30px; height: 30px; border-radius: 6px; margin-right: 10px; object-fit: cover;">
              <span>${channel.name}</span>
            </div>`
      ).join('');

      sideMenu.innerHTML = `
            <div style="padding: 1rem 0; border-bottom: 1px solid var(--glass-border); margin-bottom: 1rem;">
              <h3 style="margin: 0; color: var(--text-primary); font-size: 1.1rem; font-weight: 600;">Channels</h3>
            </div>
            ${channelMenuContent}
            <style>
              .channel-menu-item {
                display: flex;
                align-items: center;
                padding: 0.75rem 1rem;
                margin: 0.25rem 0;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.3s ease;
                color: var(--text-secondary);
                font-weight: 500;
                border: 1px solid transparent;
                font-size: 0.9rem;
              }
              .channel-menu-item:hover, .channel-menu-item.active {
                background: var(--glass-bg);
                border-color: var(--accent-color);
                color: var(--text-primary);
                transform: translateX(4px);
              }
              .channel-menu-item span {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              }
            </style>
          `;// Store channels globally for filtering
      window.allChannels = channels;

      // Display channels based on filter
      displayChannels(channels);

      // Auto-play first channel if supported, otherwise show menu
      if (channels.length > 0) {
        const firstChannel = channels[0];
        // Skip iframe-based channels or special iframe channels for auto-play
        if (!firstChannel.url.includes('php?m3u8') && firstChannel.name !== '12-kanal-il') {
          // Hide side menu automatically
          if (isMenuVisible) toggleSideMenu();
          // Attempt to play via playStream, fallback to picker on failure
          playStream(firstChannel.url)
            .then(() => {
              // Mark first channel as active
              const firstMenuItem = document.querySelector('[data-index="0"]');
              if (firstMenuItem) firstMenuItem.classList.add('active');
            })
            .catch(err => {
              console.error('Auto-play failed:', err);
              showPicker();
            });
        } else {
          // Cannot auto-play iframe streams; show picker
          showPicker();
        }
      }
    })
    .catch(error => {
      console.error('Error loading channels:', error);
      channelPicker.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 2rem;">Failed to load channels. Please try again.</div>';
    });
}

function displayChannels(channelsToShow) {
  const channelPicker = document.getElementById('channelPicker');
  channelPicker.innerHTML = '';

  if (isFilterApplied && channelsToShow === window.allChannels) {
    // Show only Israel channels initially
    channelsToShow = window.allChannels.filter(channel => channel.groupTitle === 'Israel');

    // Add "Show US Channels" button
    const showUSChannelsButton = document.createElement('button');
    showUSChannelsButton.id = 'showUSChannels';
    showUSChannelsButton.className = 'channel-button';

    const flagImg = document.createElement('img');
    flagImg.src = 'https://i.imgur.com/lUKWqOA.png';
    flagImg.style.height = '40px';
    flagImg.style.marginBottom = '0.5rem';

    const textDiv = document.createElement('div');
    textDiv.textContent = 'Show US Channels';
    textDiv.style.fontSize = '0.85rem';
    textDiv.style.fontWeight = '600';

    showUSChannelsButton.appendChild(flagImg);
    showUSChannelsButton.appendChild(textDiv);
    channelPicker.appendChild(showUSChannelsButton);

    showUSChannelsButton.addEventListener('click', function () {
      isFilterApplied = false;
      displayChannels(window.allChannels);
    });
  }

  channelsToShow.forEach(channel => {
    const button = createButton(channel.name, channel.logo, channel.url, channel.groupTitle);
    if (button) {
      channelPicker.appendChild(button);
    }
  });
} window.onload = function () {
  start();
};

// Keyboard shortcuts
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

// New functions for two-digit channel input
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

function updateChannelInputDisplay() {
  if (!channelInputDisplay) return;
  channelInputDisplay.classList.remove('hidden');
  channelInputSpans[0].textContent = channelInput[0] || '_';
  channelInputSpans[1].textContent = channelInput[1] || '_';
}

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

// New function to play separate video and audio streams for specific channel
function playVideoAndAudio(videoUrl, audioUrl, options = null) {
  cleanupAllMedia();

  return new Promise((resolve, reject) => {
    const {
      headers: normalizedHeaders,
      initialLiveBufferSeconds,
      postReadyDelayMs,
      loadingMessage
    } = normalizePlaybackOptions(options);
    const bufferSeconds = Math.max(initialLiveBufferSeconds || 0, 0);
    const loadingMessageText = loadingMessage || (bufferSeconds >= 1 ? `Buffering stream (~${Math.round(bufferSeconds)}s)...` : 'Loading buffer...');

    const videoElement = document.createElement('video');
    videoElement.className = 'video-element';
    videoElement.controls = true;
    videoElement.autoplay = false;
    videoElement.preload = 'auto';
    videoElement.muted = false;
    videoElement.volume = 1;
    videoElement.setAttribute('playsinline', '');
    videoElement.setAttribute('webkit-playsinline', '');

    const audioElement = document.createElement('video');
    audioElement.style.display = 'none';
    audioElement.autoplay = false;
    audioElement.preload = 'auto';
    audioElement.muted = false;
    audioElement.volume = 1;
    audioElement.setAttribute('playsinline', '');
    audioElement.setAttribute('webkit-playsinline', '');

    isMuted = false;
    currentVideoElement = videoElement;
    currentAudioElement = audioElement;

    const container = document.getElementById('videoContainer');
    const channelPicker = document.getElementById('channelPicker');
    const backButton = document.getElementById('backButton');
    const muteButton = document.getElementById('muteButton');

    let hlsVideo = null;
    let hlsAudio = null;
    let settled = false;

    const finalizeReject = (error) => {
      if (settled) return;
      settled = true;

      hideLoadingMessage();
      clearAudioVideoSyncInterval();

      if (hlsVideo) {
        try { hlsVideo.destroy(); } catch (_error) { }
        if (currentHlsVideoInstance === hlsVideo) {
          currentHlsVideoInstance = null;
        }
        hlsVideo = null;
      }
      if (hlsAudio) {
        try { hlsAudio.destroy(); } catch (_error) { }
        if (currentHlsAudioInstance === hlsAudio) {
          currentHlsAudioInstance = null;
        }
        hlsAudio = null;
      }

      [audioElement, videoElement].forEach(element => {
        if (!element) return;
        try {
          element.pause();
        } catch (_error) {
          // No-op
        }
        try {
          element.removeAttribute('src');
          element.load();
        } catch (_error) {
          // No-op
        }
        if (element.parentElement) {
          element.parentElement.removeChild(element);
        }
      });

      if (currentAudioElement === audioElement) {
        currentAudioElement = null;
      }
      if (currentVideoElement === videoElement) {
        currentVideoElement = null;
      }

      reject(error);
    };

    const waitForMediaReady = (media, timeout = 12000) => new Promise((resolveReady, rejectReady) => {
      if (media.readyState >= 2) {
        resolveReady();
        return;
      }

      let timeoutId = null;

      const cleanupListeners = () => {
        media.removeEventListener('canplay', onReady);
        media.removeEventListener('loadedmetadata', onReady);
        media.removeEventListener('error', onError);
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      const onReady = () => {
        cleanupListeners();
        resolveReady();
      };

      const onError = () => {
        cleanupListeners();
        rejectReady(new Error('Failed to buffer media stream'));
      };

      timeoutId = setTimeout(() => {
        cleanupListeners();
        rejectReady(new Error('Timed out while buffering media stream'));
      }, timeout);

      media.addEventListener('canplay', onReady, { once: true });
      media.addEventListener('loadedmetadata', onReady, { once: true });
      media.addEventListener('error', onError, { once: true });
    });

    const waitForSeekable = (media, maxWait = 10000) => new Promise(resolveSeekable => {
      if (media.seekable && media.seekable.length > 0) {
        resolveSeekable();
        return;
      }

      let elapsed = 0;
      const step = 250;

      const intervalId = setInterval(() => {
        if (media.seekable && media.seekable.length > 0) {
          clearInterval(intervalId);
          resolveSeekable();
          return;
        }

        elapsed += step;
        if (elapsed >= maxWait) {
          clearInterval(intervalId);
          resolveSeekable();
        }
      }, step);
    });

    const alignInitialPosition = () => {
      const getSeekableEnd = (media) => {
        if (!media.seekable || media.seekable.length === 0) return null;
        try {
          return media.seekable.end(media.seekable.length - 1);
        } catch (_error) {
          return null;
        }
      };

      let target = null;
      const videoEnd = getSeekableEnd(videoElement);
      const audioEnd = getSeekableEnd(audioElement);
      const preferredOffset = bufferSeconds > 0 ? bufferSeconds : 1;

      if (videoEnd !== null && audioEnd !== null) {
        target = Math.min(videoEnd, audioEnd) - preferredOffset;
        if (!Number.isFinite(target) || target <= 0.1) {
          target = null;
        }
      }

      if (target === null) {
        const fallback = Math.max(videoElement.currentTime || 0, audioElement.currentTime || 0);
        if (fallback > 0) {
          const fallbackTarget = fallback - bufferSeconds;
          if (Number.isFinite(fallbackTarget) && fallbackTarget > 0.1) {
            target = fallbackTarget;
          }
        }
      }

      if (target !== null) {
        const clampedTarget = Math.max(target, 0);
        try { videoElement.currentTime = clampedTarget; } catch (_error) { }
        try { audioElement.currentTime = clampedTarget; } catch (_error) { }
      }
    };

    const updateMuteButton = () => {
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
    };

    const setupUi = () => {
      container.innerHTML = '';
      container.appendChild(videoElement);
      container.appendChild(audioElement);
      container.style.display = 'block';

      if (channelPicker) {
        channelPicker.style.display = 'none';
      }

      if (backButton) {
        backButton.style.display = 'block';
      }

      updateMuteButtonVisibility(false);
      updateMuteButton();
      showLoadingMessage(loadingMessageText);
    };

    const startSyncMonitor = () => {
      clearAudioVideoSyncInterval();
      try {
        audioElement.playbackRate = 1;
      } catch (_error) {
        // No-op
      }

      audioVideoSyncInterval = setInterval(() => {
        if (!currentVideoElement || !currentAudioElement) return;
        if (videoElement.readyState < 2 || audioElement.readyState < 2) return;

        const diff = audioElement.currentTime - videoElement.currentTime;
        if (!Number.isFinite(diff)) return;

        if (Math.abs(diff) > 1.5) {
          try {
            audioElement.currentTime = videoElement.currentTime;
          } catch (error) {
            console.warn('Hard audio sync failed:', error);
          }
          audioElement.playbackRate = 1;
          return;
        }

        if (Math.abs(diff) > 0.1) {
          audioElement.playbackRate = diff > 0 ? 0.97 : 1.03;
        } else if (audioElement.playbackRate !== 1) {
          audioElement.playbackRate = 1;
        }
      }, 500);
    };

    const beginPlayback = async () => {
      try {
        setupUi();
        await waitForMediaReady(videoElement);
        await waitForMediaReady(audioElement);
        await Promise.all([waitForSeekable(videoElement), waitForSeekable(audioElement)]);
        alignInitialPosition();
        if (postReadyDelayMs > 0) {
          await new Promise(resolveDelay => setTimeout(resolveDelay, postReadyDelayMs));
        }
        await videoElement.play();
        await audioElement.play();

        startSyncMonitor();
        hideLoadingMessage();

        if (!settled) {
          settled = true;
          resolve();
        }
      } catch (error) {
        finalizeReject(error);
      }
    };

    if (Hls.isSupported()) {
      const hlsConfig = {
        enableWorker: true,
        lowLatencyMode: false,
        liveSyncDuration: 6,
        liveMaxLatencyDuration: 18,
        backBufferLength: 0
      };

      // Add headers support if provided
      if (normalizedHeaders && typeof normalizedHeaders === 'object') {
        hlsConfig.xhrSetup = function (xhr, url) {
          try {
            for (const key in normalizedHeaders) {
              if (Object.prototype.hasOwnProperty.call(normalizedHeaders, key)) {
                xhr.setRequestHeader(key, normalizedHeaders[key]);
              }
            }
          } catch (e) {
            console.warn('Failed to set custom headers on XHR:', e);
          }
        };
      }

      hlsVideo = new Hls(hlsConfig);
      hlsAudio = new Hls(hlsConfig);

      // Store HLS instances globally for cleanup
      currentHlsVideoInstance = hlsVideo;
      currentHlsAudioInstance = hlsAudio;

      const handleFatalError = (label, data) => {
        if (!data || !data.fatal) return;
        const detail = data.details || data.type || 'unknown error';
        finalizeReject(new Error(`Failed to load ${label} stream (${detail})`));
      };

      hlsVideo.on(Hls.Events.ERROR, (_event, data) => handleFatalError('video', data));
      hlsAudio.on(Hls.Events.ERROR, (_event, data) => handleFatalError('audio', data));

      const videoManifestReady = new Promise((res) => {
        hlsVideo.on(Hls.Events.MANIFEST_PARSED, () => res());
      });
      const audioManifestReady = new Promise((res) => {
        hlsAudio.on(Hls.Events.MANIFEST_PARSED, () => res());
      });

      hlsVideo.loadSource(videoUrl);
      hlsVideo.attachMedia(videoElement);

      hlsAudio.loadSource(audioUrl);
      hlsAudio.attachMedia(audioElement);

      Promise.all([videoManifestReady, audioManifestReady])
        .then(() => beginPlayback())
        .catch(finalizeReject);
    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      if (normalizedHeaders) {
        console.warn('Custom headers were requested but cannot be applied for native HLS playback in this browser. Proceeding without headers.');
      }
      videoElement.src = videoUrl;
      audioElement.src = audioUrl;

      const onError = () => finalizeReject(new Error('Failed to load HLS streams natively'));
      videoElement.addEventListener('error', onError, { once: true });
      audioElement.addEventListener('error', onError, { once: true });

      beginPlayback();
    } else {
      finalizeReject(new Error('HLS is not supported'));
    }
  });
}
