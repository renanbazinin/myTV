let isPickerVisible = true;
    let isMenuVisible = true;
    const sideMenu = document.getElementById('sideMenu');
    const contentArea = document.getElementById('contentArea');    let isFilterApplied = true;    let currentVideoElement = null;
    let isMuted = true; // Start muted for autoplay compatibility

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

    function toggleMute() {
      const muteButton = document.getElementById('muteButton');
      
      if (currentVideoElement) {
        isMuted = !isMuted;
        currentVideoElement.muted = isMuted;
        
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
      return new Promise((resolve, reject) => {
       const videoElement = document.createElement('video');
       videoElement.className = 'video-element';
       videoElement.controls = true;
       videoElement.autoplay = true;
       videoElement.muted = false; // Start unmuted so clicking a channel auto-plays with sound
       isMuted = false;

       // Store reference to current video element
       currentVideoElement = videoElement;

       // Check if HLS.js is supported
       if (Hls.isSupported()) {
         const hls = new Hls();
         hls.loadSource(url);
         hls.attachMedia(videoElement);
         hls.on(Hls.Events.MANIFEST_PARSED, function () {
          videoElement.play().then(resolve).catch(reject);
        });
       } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
         // If native HLS is supported
         videoElement.src = url;
        videoElement.addEventListener('loadedmetadata', function() {
          videoElement.play().then(resolve).catch(reject);
        });
       } else {
        reject(new Error('HLS is not supported'));
       }

       document.getElementById('videoContainer').innerHTML = '';
       document.getElementById('videoContainer').appendChild(videoElement);
       document.getElementById('videoContainer').style.display = 'block';
       document.getElementById('channelPicker').style.display = 'none';
       document.getElementById('backButton').style.display = 'block';

       // Show mute button and update its state to unmuted
       updateMuteButtonVisibility(false);
       const muteButton = document.getElementById('muteButton');
       muteButton.textContent = '🔊';
       muteButton.classList.remove('muted');
       muteButton.title = 'Mute';

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
      
      if (url.includes('php?m3u8')) {
        const iframe = document.createElement('iframe');
        iframe.src = 'https://www.mako.co.il/AjaxPage?jspName=embedHTML5video.jsp&galleryChannelId=7c5076a9b8757810VgnVCM100000700a10acRCRD&videoChannelId=d1d6f5dfc8517810VgnVCM100000700a10acRCRD&vcmid=1e2258089b67f510VgnVCM2000002a0c10acRCRD';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.allowfullscreen = true;
        
        document.getElementById('videoContainer').innerHTML = '';
        document.getElementById('videoContainer').appendChild(iframe);
        document.getElementById('videoContainer').style.display = 'block';
        
        // Hide channel picker and show back button
        document.getElementById('channelPicker').style.display = 'none';
        document.getElementById('backButton').style.display = 'block';
        isPickerVisible = false;
      } else {
        if (name === '13-kanal-il1') {
          playVideoAndAudio(
            'https://d1zqtf09wb8nt5.cloudfront.net/livehls/oil/freetv/live/reshet_13_hevc/live.livx/playlist.m3u8?bitrate=5500000&videoId=0&renditions&fmp4&dvr=28800000',
            'https://d1zqtf09wb8nt5.cloudfront.net/livehls/oil/freetv/live/reshet_13_hevc/live.livx/playlist.m3u8?bitrate=128000&audioId=1&lang=pol&renditions&fmp4&dvr=28800000'
          );
        } else {
          playStream(url);
        }
      }
    }function createButton(name, logo, url, groupTitle) {
      console.log("groupTitle=" + groupTitle);
      console.log("isFilterApplied=" + isFilterApplied);
      
      // Remove the filtering logic from createButton since it's now handled in displayChannels
      var button = document.createElement('button');
      button.className = 'channel-button';
      
      // Create image element
      const img = document.createElement('img');
      img.src = logo;
      img.alt = name;
      img.onerror = function() {
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
        button.addEventListener('click', function() { 
        // Hide side menu when channel is selected
        if (isMenuVisible) {
          toggleSideMenu();
        }
        
        if (url.includes('php?m3u8') ) {
          const iframe = document.createElement('iframe');
          iframe.src = 'https://www.mako.co.il/AjaxPage?jspName=embedHTML5video.jsp&galleryChannelId=7c5076a9b8757810VgnVCM100000700a10acRCRD&videoChannelId=d1d6f5dfc8517810VgnVCM100000700a10acRCRD&vcmid=1e2258089b67f510VgnVCM2000002a0c10acRCRD';
          iframe.style.width = '100%';
          iframe.style.height = '100%';
          iframe.style.border = 'none';
          iframe.allowfullscreen = true;          document.getElementById('videoContainer').innerHTML = '';
          document.getElementById('videoContainer').appendChild(iframe);
          document.getElementById('videoContainer').style.display = 'block';
          
          // Hide channel picker and show back button
          document.getElementById('channelPicker').style.display = 'none';
          document.getElementById('backButton').style.display = 'block';
          isPickerVisible = false;
        } else {
          if (name === '13-kanal-il') {
            playVideoAndAudio(
              'https://d1zqtf09wb8nt5.cloudfront.net/livehls/oil/freetv/live/reshet_13_hevc/live.livx/playlist.m3u8?bitrate=5500000&videoId=0&renditions&fmp4&dvr=28800000',
              'https://d1zqtf09wb8nt5.cloudfront.net/livehls/oil/freetv/live/reshet_13_hevc/live.livx/playlist.m3u8?bitrate=128000&audioId=1&lang=pol&renditions&fmp4&dvr=28800000'
            );
          } else {
            playStream(url);
          }
        }
      });
      
      return button;
    }    function showPicker() {
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
    }    function hidePicker() {
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
    document.getElementById('backButton').addEventListener('click', function() {
      // Back button now just toggles the side menu like Hide Menu button
      toggleSideMenu();
    });function start() {
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
            // Skip iframe-based channels for auto-play
            if (!firstChannel.url.includes('php?m3u8')) {
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
        
        showUSChannelsButton.addEventListener('click', function() {
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
    }    window.onload = function() {
      start();
    };

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
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
function playVideoAndAudio(videoUrl, audioUrl) {
  return new Promise((resolve, reject) => {
    const videoElement = document.createElement('video');
    videoElement.className = 'video-element';
    videoElement.controls = true;
    videoElement.autoplay = true;
    videoElement.muted = false;
    isMuted = false;
    const audioElement = document.createElement('video');
    audioElement.style.display = 'none';
    audioElement.autoplay = true;
    audioElement.muted = false;
    // Store video element reference
    currentVideoElement = videoElement;
    const container = document.getElementById('videoContainer');
    // Use HLS.js for both streams
    if (Hls.isSupported()) {
      const hlsVideo = new Hls();
      hlsVideo.loadSource(videoUrl);
      hlsVideo.attachMedia(videoElement);
      const hlsAudio = new Hls();
      hlsAudio.loadSource(audioUrl);
      hlsAudio.attachMedia(audioElement);
      hlsVideo.on(Hls.Events.MANIFEST_PARSED, () => {
        container.innerHTML = '';
        container.appendChild(videoElement);
        container.appendChild(audioElement);
        container.style.display = 'block';
        document.getElementById('channelPicker').style.display = 'none';
        document.getElementById('backButton').style.display = 'block';
        updateMuteButtonVisibility(false);
        const muteButton = document.getElementById('muteButton');
        muteButton.textContent = '🔊';
        muteButton.classList.remove('muted');
        muteButton.title = 'Mute';
        videoElement.play()
          .then(() => audioElement.play().then(resolve).catch(reject))
          .catch(reject);
      });
    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      videoElement.src = videoUrl;
      audioElement.src = audioUrl;
      videoElement.addEventListener('loadedmetadata', () => {
        container.innerHTML = '';
        container.appendChild(videoElement);
        container.appendChild(audioElement);
        container.style.display = 'block';
        document.getElementById('channelPicker').style.display = 'none';
        document.getElementById('backButton').style.display = 'block';
        updateMuteButtonVisibility(false);
        const muteButton = document.getElementById('muteButton');
        muteButton.textContent = '🔊';
        muteButton.classList.remove('muted');
        muteButton.title = 'Mute';
        Promise.all([videoElement.play(), audioElement.play()]).then(resolve).catch(reject);
      });
    } else {
      reject(new Error('HLS is not supported'));
    }
  });
}