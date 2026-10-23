// Run with: npm test (node --test tests/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { actionOf, digitOf } from '../js/keys.js';

const key = (props) => Object.assign({ key: '', code: '', keyCode: 0, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, props);

test('arrows, OK and Escape from standard keys', () => {
    assert.equal(actionOf(key({ key: 'ArrowUp', keyCode: 38 })), 'up');
    assert.equal(actionOf(key({ key: 'Down', keyCode: 40 })), 'down');
    assert.equal(actionOf(key({ key: 'Enter', keyCode: 13 })), 'ok');
    assert.equal(actionOf(key({ key: 'Escape', keyCode: 27 })), 'escape');
});

test('TV remotes that only send keyCodes', () => {
    assert.equal(actionOf(key({ key: 'Unidentified', keyCode: 461 })), 'back'); // LG webOS
    assert.equal(actionOf(key({ key: 'XF86Back', keyCode: 10009 })), 'back'); // Samsung Tizen
    assert.equal(actionOf(key({ key: 'Unidentified', keyCode: 10009 })), 'back');
    assert.equal(actionOf(key({ key: 'Unidentified', keyCode: 405 })), 'yellow');
    assert.equal(actionOf(key({ key: 'Unidentified', keyCode: 406 })), 'blue');
    assert.equal(actionOf(key({ key: 'Unidentified', keyCode: 427 })), 'channel-up');
    assert.equal(actionOf(key({ key: 'Unidentified', keyCode: 428 })), 'channel-down');
    assert.equal(actionOf(key({ key: 'Unidentified', keyCode: 10252 })), 'play-pause');
    assert.equal(actionOf(key({ key: 'MediaPlayPause', keyCode: 179 })), 'play-pause');
    assert.equal(actionOf(key({ keyCode: 38 })), 'up');
});

test('Backspace is Back on TVs, recall elsewhere', () => {
    assert.equal(actionOf(key({ key: 'Backspace', keyCode: 8 }), { tv: true }), 'back');
    assert.equal(actionOf(key({ key: 'Backspace', keyCode: 8 }), { tv: false }), 'backspace');
});

test('PageUp/PageDown stay distinct from channel keys (they scroll the guide)', () => {
    assert.equal(actionOf(key({ key: 'PageUp', keyCode: 33 })), 'page-up');
    assert.equal(actionOf(key({ key: 'ChannelUp', keyCode: 0 })), 'channel-up');
});

test('letter shortcuts work with a Hebrew keyboard layout', () => {
    // On a Hebrew layout the S key types "ד" and M types "צ"
    assert.equal(actionOf(key({ key: 'ד', code: 'KeyS' })), 'char:s');
    assert.equal(actionOf(key({ key: 'צ', code: 'KeyM' })), 'char:m');
    assert.equal(actionOf(key({ key: 'F', code: 'KeyF', shiftKey: true })), 'char:f');
    assert.equal(actionOf(key({ key: '.', code: 'Slash' })), 'search');
    assert.equal(actionOf(key({ key: '?', code: 'Slash', shiftKey: true })), 'help');
});

test('symbols follow the typed character before the physical key', () => {
    // German / Nordic / Spanish layouts type '-' on the US '/' key
    assert.equal(actionOf(key({ key: '-', code: 'Slash' })), 'volume-down');
    assert.equal(actionOf(key({ key: '+', code: 'BracketRight' })), 'volume-up');
    assert.equal(actionOf(key({ key: '/', code: 'Digit7', shiftKey: true })), 'search');
});

test('modifier shortcuts are left to the browser', () => {
    assert.equal(actionOf(key({ key: 'f', code: 'KeyF', ctrlKey: true })), null);
    assert.equal(actionOf(key({ key: 'r', code: 'KeyR', metaKey: true })), null);
});

test('digits from the top row, numpad and old TV engines', () => {
    assert.equal(digitOf(key({ key: '7', keyCode: 55 })), 7);
    assert.equal(digitOf(key({ key: '&', code: 'Digit1' })), 1); // AZERTY top row
    assert.equal(digitOf(key({ key: 'Unidentified', keyCode: 52 })), 4);
    assert.equal(digitOf(key({ key: 'Unidentified', keyCode: 99 })), 3);
    assert.equal(actionOf(key({ key: '5', keyCode: 53 })), 'digit');
    assert.equal(actionOf(key({ key: ' ', code: 'Space', keyCode: 32 })), 'space');
});
