// settings.js - Settings sheet: volume, layout, start-up and zapping options

import { $, $$ } from '../dom.js';
import { state, emit, setLayoutPreference, setAutoplayLast, setReverseZap } from '../store.js';
import * as player from '../player.js';
import { openSheet, openHelp, closeSheet } from './overlays.js';
import { isTvMode, isCoarsePointer } from '../device.js';

let els = {};

function renderSwitch(button, on) {
    button.setAttribute('aria-checked', on ? 'true' : 'false');
}

function renderLayout() {
    $$('.segment', els.sheet).forEach((segment) => {
        const selected = segment.getAttribute('data-layout') === state.layout;
        segment.setAttribute('aria-checked', selected ? 'true' : 'false');
        segment.setAttribute('tabindex', selected ? '0' : '-1');
    });
}

export function helpTabForDevice() {
    if (isTvMode()) return 'remote';
    if (isCoarsePointer()) return 'touch';
    return 'keyboard';
}

export function openSettings() {
    renderLayout();
    renderSwitch(els.autoplay, state.autoplayLast);
    renderSwitch(els.reverseZap, state.reverseZap);
    // TV volume is the TV's; iOS volume is the hardware buttons
    els.volumeRow.hidden = isTvMode() || !player.volumeWritable();
    openSheet(els.sheet);
}

export function initSettings() {
    els = {
        sheet: $('#settingsSheet'),
        volume: $('#settingsVolume'),
        mute: $('#settingsMute'),
        volumeRow: $('#settingsVolumeRow'),
        autoplay: $('#autoplayToggle'),
        reverseZap: $('#reverseZapToggle'),
        refresh: $('#refreshChannels'),
        help: $('#openHelp')
    };

    els.volume.addEventListener('input', () => player.setVolume(Number(els.volume.value) / 100));
    els.mute.addEventListener('click', () => player.toggleMute());

    // Left/Right adjust the slider; arrows otherwise belong to spatial nav
    els.volume.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft' || event.key === 'Left' || event.key === 'ArrowRight' || event.key === 'Right') {
            event.stopPropagation();
        }
    });

    $$('.segment', els.sheet).forEach((segment) => {
        segment.addEventListener('click', () => {
            setLayoutPreference(segment.getAttribute('data-layout'));
            renderLayout();
        });
    });

    els.autoplay.addEventListener('click', () => {
        setAutoplayLast(!state.autoplayLast);
        renderSwitch(els.autoplay, state.autoplayLast);
    });

    els.reverseZap.addEventListener('click', () => {
        setReverseZap(!state.reverseZap);
        renderSwitch(els.reverseZap, state.reverseZap);
        emit('zap-direction');
    });

    els.refresh.addEventListener('click', () => {
        closeSheet(els.sheet);
        emit('playlist:refresh', { manual: true });
    });

    els.help.addEventListener('click', () => {
        openHelp(helpTabForDevice(), els.sheet);
    });
}
