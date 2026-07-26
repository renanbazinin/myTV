// channels.js - Channel loading and display for myTV

const M3U_URL = 'https://raw.githubusercontent.com/renanbazinin/myM3U/main/directLiveNamesDiffandEPG1.m3u';
const M3U_CACHE_KEY = 'myTV_m3u_cache_v1';
const M3U_CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * Play channel from menu / grid
 * @param {string} url - Channel stream URL
 * @param {string} name - Channel name
 * @param {number} index - Channel index in window.allChannels
 */
async function playChannelFromMenu(url, name, index) {
    if (currentChannelIndex >= 0) {
        previousChannelIndex = currentChannelIndex;
    }
    currentChannelIndex = index;

    if (isMenuVisible && isMobileLayout()) {
        closeSideMenu();
    }

    cleanupAllMedia();
    updateActiveChannelInLists(index);

    try {
        if (typeof needsHelperFetcher === 'function' && needsHelperFetcher(name)) {
            const dynamicUrl = await fetchStreamUrl(name);
            if (!dynamicUrl) {
                showToast(`Failed to load ${name}. Please try again.`);
                return;
            }
            await playStream(dynamicUrl);
            return;
        }

        let streamUrl = url;
        const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
        if ((name === '12-kanal-il' || name === '13-kanal-il') && isFirefox) {
            streamUrl = url.replace(/_hevc/g, '').replace(/[&?]fmp4/g, '');
        }

        await playStream(streamUrl);
    } catch (error) {
        console.error(`[Channels] Error loading ${name}:`, error);
        showToast(`Error loading ${name}`);
        showPicker();
    }
}

/**
 * Highlight active channel rows
 * @param {number} index
 */
function updateActiveChannelInLists(index) {
    document.querySelectorAll('.channel-menu-item').forEach((item) => {
        item.classList.toggle('active', Number(item.dataset.index) === index);
    });
}

/**
 * Create a logo image with lazy loading and fallback
 * @param {string} logo
 * @param {string} name
 * @param {HTMLElement} host
 */
function createChannelLogo(logo, name, host) {
    const img = document.createElement('img');
    img.alt = name;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';

    img.onerror = function () {
        this.remove();
        const fallback = document.createElement('div');
        fallback.className = 'channel-logo-fallback';
        fallback.textContent = '📺';
        fallback.setAttribute('aria-hidden', 'true');
        host.insertBefore(fallback, host.firstChild);
    };

    if (logo) {
        img.src = logo;
    } else {
        img.onerror();
        return null;
    }

    return img;
}

/**
 * Create channel button element
 * @param {Object} channel
 * @returns {HTMLButtonElement}
 */
function createButton(channel) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'channel-button';
    button.dataset.index = String(channel.index);

    const img = createChannelLogo(channel.logo, channel.name, button);
    if (img) {
        button.appendChild(img);
    }

    const nameDiv = document.createElement('div');
    nameDiv.className = 'channel-button-name';
    nameDiv.textContent = channel.name;
    button.appendChild(nameDiv);

    button.addEventListener('click', function () {
        playChannelFromMenu(channel.url, channel.name, channel.index);
    });

    return button;
}

/**
 * Filter channels by category + search
 * @returns {Array}
 */
function getFilteredChannels() {
    const all = window.allChannels || [];
    const query = (currentSearchQuery || '').trim().toLowerCase();

    return all.filter((channel) => {
        const categoryOk = currentCategory === 'All' || channel.groupTitle === currentCategory;
        if (!categoryOk) return false;
        if (!query) return true;
        return channel.name.toLowerCase().includes(query)
            || (channel.groupTitle || '').toLowerCase().includes(query);
    });
}

/**
 * Render category chips in the browser toolbar
 */
function renderCategoryChips() {
    const chips = document.getElementById('categoryChips');
    if (!chips) return;

    chips.innerHTML = '';
    const fragment = document.createDocumentFragment();

    availableCategories.forEach((category) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'category-chip' + (category === currentCategory ? ' active' : '');
        chip.textContent = category;
        chip.setAttribute('aria-pressed', category === currentCategory ? 'true' : 'false');
        chip.addEventListener('click', function () {
            setCategoryFilter(category);
        });
        fragment.appendChild(chip);
    });

    chips.appendChild(fragment);
}

/**
 * Render category buttons in the drawer
 */
function renderCategoryList() {
    const list = document.getElementById('categoryList');
    if (!list) return;

    list.innerHTML = '';
    const fragment = document.createDocumentFragment();

    availableCategories.forEach((category) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'category-item' + (category === currentCategory ? ' active' : '');
        item.textContent = category;
        item.addEventListener('click', function () {
            setCategoryFilter(category);
            if (isMobileLayout()) {
                closeSideMenu();
            }
        });
        fragment.appendChild(item);
    });

    list.appendChild(fragment);
}

/**
 * Render channel list in the drawer (lazy logos)
 */
function renderChannelList(channels) {
    const list = document.getElementById('channelList');
    if (!list) return;

    list.innerHTML = '';
    const fragment = document.createDocumentFragment();

    channels.forEach((channel) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'channel-menu-item' + (channel.index === currentChannelIndex ? ' active' : '');
        item.dataset.index = String(channel.index);

        const img = createChannelLogo(channel.logo, channel.name, item);
        if (img) {
            item.appendChild(img);
        }

        const span = document.createElement('span');
        span.textContent = channel.name;
        item.appendChild(span);

        item.addEventListener('click', function () {
            playChannelFromMenu(channel.url, channel.name, channel.index);
        });

        fragment.appendChild(item);
    });

    list.appendChild(fragment);
}

/**
 * Set category filter and re-render
 * @param {string} category
 */
function setCategoryFilter(category) {
    currentCategory = category || 'All';
    if (currentCategory === 'All') {
        isFilterApplied = false;
    }
    renderCategoryChips();
    renderCategoryList();
    renderFilteredChannels();
}

/**
 * Render the filtered channel grid
 */
function renderFilteredChannels() {
    const channelPicker = document.getElementById('channelPicker');
    if (!channelPicker) return;

    const channelsToShow = getFilteredChannels();
    channelPicker.innerHTML = '';

    if (!channelsToShow.length) {
        const empty = document.createElement('div');
        empty.className = 'channel-empty';
        empty.textContent = 'No channels match your search.';
        channelPicker.appendChild(empty);
        return;
    }

    const fragment = document.createDocumentFragment();
    channelsToShow.forEach((channel) => {
        fragment.appendChild(createButton(channel));
    });
    channelPicker.appendChild(fragment);
}

/**
 * Display channels after initial load / filter reset
 * @param {Array} channelsToShow
 */
function displayChannels(channelsToShow) {
    window.allChannels = (channelsToShow || []).map((channel, index) => ({
        ...channel,
        index: typeof channel.index === 'number' ? channel.index : index
    }));

    const categories = new Set(['All']);
    window.allChannels.forEach((channel) => {
        categories.add(channel.groupTitle || 'Other');
    });
    availableCategories = Array.from(categories);

    if (isFilterApplied && availableCategories.includes('Israel')) {
        currentCategory = 'Israel';
    } else if (!availableCategories.includes(currentCategory)) {
        currentCategory = 'All';
    }

    renderCategoryChips();
    renderCategoryList();
    renderChannelList(window.allChannels);
    renderFilteredChannels();
}

/**
 * Parse M3U playlist text into channel objects
 * @param {string} data
 * @returns {Array}
 */
function parseM3uPlaylist(data) {
    const lines = data.split(/\r?\n/);
    const channels = [];
    let currentChannel = {};

    lines.forEach((line) => {
        if (line.startsWith('#EXTINF:-1')) {
            if (currentChannel.name && currentChannel.logo && currentChannel.url) {
                channels.push(currentChannel);
                currentChannel = {};
            }
            const nameMatch = line.match(/tvg-id="([^"]+)"/);
            const logoMatch = line.match(/tvg-logo="([^"]+)"/);
            const groupTitleMatch = line.match(/group-title="([^"]+)"/);
            if (nameMatch && logoMatch) {
                currentChannel = {
                    name: nameMatch[1],
                    logo: logoMatch[1],
                    groupTitle: groupTitleMatch ? groupTitleMatch[1] : 'Other'
                };
            }
        } else if (line.trim() !== '' && !line.startsWith('#')) {
            currentChannel.url = line;
        }
    });

    if (currentChannel.name && currentChannel.logo && currentChannel.url) {
        channels.push(currentChannel);
    }

    return channels.map((channel, index) => ({ ...channel, index }));
}

/**
 * Read short-lived M3U cache from sessionStorage
 * @returns {{channels: Array, fetchedAt: number}|null}
 */
function readM3uCache() {
    try {
        const raw = sessionStorage.getItem(M3U_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.channels) || !parsed.fetchedAt) return null;
        if (Date.now() - parsed.fetchedAt > M3U_CACHE_TTL_MS) return null;
        return parsed;
    } catch (_error) {
        return null;
    }
}

/**
 * Persist M3U cache
 * @param {Array} channels
 */
function writeM3uCache(channels) {
    try {
        sessionStorage.setItem(M3U_CACHE_KEY, JSON.stringify({
            channels,
            fetchedAt: Date.now()
        }));
    } catch (_error) {
        // Ignore quota / private mode failures
    }
}

/**
 * Apply loaded channels to the UI
 * @param {Array} channels
 */
function applyChannels(channels) {
    displayChannels(channels);
    showPicker();
}

/**
 * Fetch and parse M3U playlist, then display channels
 */
function start() {
    const channelPicker = document.getElementById('channelPicker');
    if (channelPicker) {
        channelPicker.innerHTML = '<div class="loading">Loading channels...</div>';
    }

    const cached = readM3uCache();
    if (cached) {
        applyChannels(cached.channels);
    }

    fetch(M3U_URL)
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Playlist HTTP ${response.status}`);
            }
            return response.text();
        })
        .then((data) => {
            const channels = parseM3uPlaylist(data);
            if (!channels.length) {
                throw new Error('Playlist contained no channels');
            }
            writeM3uCache(channels);
            applyChannels(channels);
        })
        .catch((error) => {
            console.error('Error loading channels:', error);
            if (cached) {
                showToast('Using cached channel list (offline refresh failed)');
                return;
            }
            showErrorState('Failed to load channels. Please try again.', start);
        });
}
