// channels.js - Channel loading and display for myTV

/**
 * Play channel from side menu
 * @param {string} url - Channel stream URL
 * @param {string} name - Channel name
 * @param {number} index - Channel index
 */
function playChannelFromMenu(url, name, index) {
    // Hide side menu when channel is selected
    if (isMenuVisible) {
        toggleSideMenu();
    }

    // Update active channel in menu
    document.querySelectorAll('.channel-menu-item').forEach(item => item.classList.remove('active'));
    const activeItem = document.querySelector(`[data-index="${index}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
    }

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

        document.getElementById('channelPicker').style.display = 'none';
        document.getElementById('backButton').style.display = 'block';
        isPickerVisible = false;
    } else {
        if (name === '12-kanal-il') {
            const vlcHeaders = {
                'User-Agent': 'VLC/3.0.11',
                'Accept': '*/*'
            };
            const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
            let streamUrl = url;
            if (isFirefox) {
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
            const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
            let streamUrl = url;
            if (isFirefox) {
                streamUrl = url.replace(/_hevc/g, '').replace(/[&?]fmp4/g, '');
            }
            playStream(streamUrl, vlcHeaders);
        } else {
            playStream(url);
        }
    }
}

/**
 * Create channel button element
 * @param {string} name - Channel name
 * @param {string} logo - Channel logo URL
 * @param {string} url - Channel stream URL
 * @param {string} groupTitle - Channel group/category
 * @returns {HTMLButtonElement} Channel button element
 */
function createButton(name, logo, url, groupTitle) {
    console.log("groupTitle=" + groupTitle);
    console.log("isFilterApplied=" + isFilterApplied);

    var button = document.createElement('button');
    button.className = 'channel-button';

    const img = document.createElement('img');
    img.src = logo;
    img.alt = name;
    img.onerror = function () {
        this.style.display = 'none';
        button.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 80px; background: var(--glass-bg); border-radius: 12px; margin-bottom: 0.5rem; font-size: 2rem;">📺</div>' + name;
    };

    button.appendChild(img);

    const nameDiv = document.createElement('div');
    nameDiv.textContent = name;
    nameDiv.style.marginTop = '0.5rem';
    nameDiv.style.fontSize = '0.85rem';
    nameDiv.style.fontWeight = '500';
    nameDiv.style.textAlign = 'center';
    nameDiv.style.lineHeight = '1.2';
    button.appendChild(nameDiv);

    button.addEventListener('click', function () {
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

            document.getElementById('channelPicker').style.display = 'none';
            document.getElementById('backButton').style.display = 'block';
            isPickerVisible = false;
        } else {
            if (name === '12-kanal-il') {
                const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
                let streamUrl = url;
                if (isFirefox) {
                    streamUrl = url.replace(/_hevc/g, '').replace(/[&?]fmp4/g, '');
                }
                playStream(streamUrl);
            } else if (name === '13-kanal-il') {
                const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
                let streamUrl = url;
                if (isFirefox) {
                    streamUrl = url.replace(/_hevc/g, '').replace(/[&?]fmp4/g, '');
                }
                playStream(streamUrl);
            } else {
                playStream(url);
            }
        }
    });

    return button;
}

/**
 * Display channels in the picker grid
 * @param {Array} channelsToShow - Array of channel objects
 */
function displayChannels(channelsToShow) {
    const channelPicker = document.getElementById('channelPicker');
    channelPicker.innerHTML = '';

    if (isFilterApplied && channelsToShow === window.allChannels) {
        channelsToShow = window.allChannels.filter(channel => channel.groupTitle === 'Israel');

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
}

/**
 * Fetch and parse M3U playlist, then display channels
 */
function start() {
    const channelPicker = document.getElementById('channelPicker');
    const sideMenuElement = document.getElementById('sideMenu');
    channelPicker.innerHTML = '<div class="loading">Loading channels...</div>';

    fetch('https://raw.githubusercontent.com/renanbazinin/myM3U/main/directLiveNamesDiffandEPG1.m3u')
        .then(response => response.text())
        .then(data => {
            channelPicker.innerHTML = '';

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

            if (currentChannel.name && currentChannel.logo && currentChannel.url) {
                channels.push(currentChannel);
                categories.add(currentChannel.groupTitle);
            }

            // Populate side menu with channels
            const channelMenuContent = channels.map((channel, index) =>
                `<div class="channel-menu-item" onclick="playChannelFromMenu('${channel.url}', '${channel.name}', ${index})" data-index="${index}">
                    <img src="${channel.logo}" alt="${channel.name}" onerror="this.style.display='none'" style="width: 30px; height: 30px; border-radius: 6px; margin-right: 10px; object-fit: cover;">
                    <span>${channel.name}</span>
                </div>`
            ).join('');

            sideMenuElement.innerHTML = `
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
            `;

            // Store channels globally for filtering
            window.allChannels = channels;

            // Display channels based on filter
            displayChannels(channels);

            // Auto-play first channel if supported
            if (channels.length > 0) {
                const firstChannel = channels[0];
                if (!firstChannel.url.includes('php?m3u8') && firstChannel.name !== '12-kanal-il') {
                    if (isMenuVisible) toggleSideMenu();
                    playStream(firstChannel.url)
                        .then(() => {
                            const firstMenuItem = document.querySelector('[data-index="0"]');
                            if (firstMenuItem) firstMenuItem.classList.add('active');
                        })
                        .catch(err => {
                            console.error('Auto-play failed:', err);
                            showPicker();
                        });
                } else {
                    showPicker();
                }
            }
        })
        .catch(error => {
            console.error('Error loading channels:', error);
            channelPicker.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 2rem;">Failed to load channels. Please try again.</div>';
        });
}
