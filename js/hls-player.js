// hls-player.js - HLS playback and media management for myTV

/**
 * Clear audio/video sync interval
 */
function clearAudioVideoSyncInterval() {
    if (audioVideoSyncInterval) {
        clearInterval(audioVideoSyncInterval);
        audioVideoSyncInterval = null;
    }
}

/**
 * Start memory usage monitoring (Chrome/Edge only)
 */
function startMemoryMonitor() {
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

            if (currentHlsVideoInstance && currentVideoElement) {
                try {
                    const keepPos = Math.max(0, currentVideoElement.currentTime - 30);
                    if (keepPos > 0) {
                        currentHlsVideoInstance.trigger(Hls.Events.BUFFER_FLUSHING, {
                            startOffset: 0,
                            endOffset: keepPos
                        });
                    }
                } catch (e) {
                    console.warn('Failed to flush video buffer:', e);
                }
            }

            if (currentHlsAudioInstance && currentAudioElement) {
                try {
                    const keepPos = Math.max(0, currentAudioElement.currentTime - 30);
                    if (keepPos > 0) {
                        currentHlsAudioInstance.trigger(Hls.Events.BUFFER_FLUSHING, {
                            startOffset: 0,
                            endOffset: keepPos
                        });
                    }
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

/**
 * Clear memory monitor interval
 */
function clearMemoryMonitor() {
    if (memoryCheckInterval) {
        clearInterval(memoryCheckInterval);
        memoryCheckInterval = null;
    }
}

/**
 * Stop and cleanup current audio element
 */
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

/**
 * Stop and cleanup current video element
 */
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

/**
 * Properly cleanup HLS instance
 * @param {Hls} hlsInstance - HLS.js instance to cleanup
 */
function cleanupHlsInstance(hlsInstance) {
    if (!hlsInstance) return;

    try {
        hlsInstance.off(Hls.Events.ERROR);
        hlsInstance.off(Hls.Events.MANIFEST_PARSED);
        hlsInstance.off(Hls.Events.FRAG_LOADED);

        if (hlsInstance.media) {
            hlsInstance.detachMedia();
        }

        hlsInstance.destroy();
    } catch (error) {
        console.warn('Failed to cleanup HLS instance:', error);
    }
}

/**
 * Cleanup all media elements and HLS instances
 */
function cleanupAllMedia() {
    hideLoadingMessage();
    clearAudioVideoSyncInterval();
    clearMemoryMonitor();

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

    // Remove any iframes (e.g., mako embed) from the video container
    const container = document.getElementById('videoContainer');
    if (container) {
        const iframes = container.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            iframe.src = '';
            iframe.remove();
        });
    }
}

/**
 * Play a single HLS stream
 * @param {string} url - Stream URL
 * @returns {Promise} Resolves when playback starts
 */
function playStream(url) {
    cleanupAllMedia();
    return new Promise((resolve, reject) => {
        const videoElement = document.createElement('video');
        videoElement.className = 'video-element';
        videoElement.controls = true;
        videoElement.autoplay = true;
        videoElement.muted = false;
        isMuted = false;

        currentVideoElement = videoElement;
        currentAudioElement = null;

        const container = document.getElementById('videoContainer');
        const channelPickerElement = document.getElementById('channelPicker');
        const backButton = document.getElementById('backButton');
        const muteButton = document.getElementById('muteButton');

        if (Hls.isSupported()) {
            const hlsConfig = {
                enableWorker: true,
                lowLatencyMode: false,
                liveSyncDuration: 25,
                liveMaxLatencyDuration: 50,
                maxBufferLength: 60,
                maxMaxBufferLength: 120,
                backBufferLength: 30,
                maxBufferSize: 250 * 1000 * 1000,
                maxBufferHole: 0.5,
                manifestLoadingTimeOut: 10000,
                manifestLoadingMaxRetry: 3,
                levelLoadingTimeOut: 10000,
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
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            console.warn('Network error encountered, trying to recover...');
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.warn('Media error encountered, trying to recover...');
                            hls.recoverMediaError();
                            break;
                        default:
                            cleanupHlsInstance(hls);
                            if (currentHlsVideoInstance === hls) {
                                currentHlsVideoInstance = null;
                            }
                            hideLoadingMessage();
                            reject(new Error('HLS playback error: ' + (data.details || 'unknown')));
                            break;
                    }
                }
            });
        } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
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

/**
 * Play separate video and audio streams (for specific channels)
 * @param {string} videoUrl - Video stream URL
 * @param {string} audioUrl - Audio stream URL
 * @param {Object} options - Playback options
 * @returns {Promise} Resolves when playback starts
 */
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
                try { element.pause(); } catch (_error) { }
                try {
                    element.removeAttribute('src');
                    element.load();
                } catch (_error) { }
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
            } catch (_error) { }

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
                liveSyncDuration: 12,
                liveMaxLatencyDuration: 30,
                backBufferLength: 30,
                maxBufferLength: 60,
                maxMaxBufferLength: 120,
                maxBufferSize: 150 * 1000 * 1000
            };

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
