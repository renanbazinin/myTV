// Run with: npm test (node --test tests/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLanguage, trackLabel, cleanCueText, joinCues, textAt, atTop } from '../js/captions.js';
import { actionOf } from '../js/keys.js';

test('language codes from manifests compare as two letters', () => {
    assert.equal(normalizeLanguage('eng'), 'en');
    assert.equal(normalizeLanguage('en-US'), 'en');
    assert.equal(normalizeLanguage('EN'), 'en');
    assert.equal(normalizeLanguage('heb'), 'he');
    assert.equal(normalizeLanguage(''), '');
    assert.equal(normalizeLanguage(undefined), '');
});

test('track names: readable names kept, internal IDs replaced by the language', () => {
    assert.equal(trackLabel('english', 'eng', 'captions'), 'English');
    assert.equal(trackLabel('Español', 'spa', 'subtitles'), 'Español');
    assert.equal(trackLabel('Source-USPhx-16k-1-s6lk2-SAMSUNG_01_SPLIT_1_sub', '', 'subtitles'), 'Subtitles');
    assert.equal(trackLabel('CC_1', 'en', 'captions'), 'English');
    assert.equal(trackLabel('CC1', 'en', 'captions'), 'English');
    assert.equal(trackLabel('CC3', 'es', 'captions'), 'Spanish');
    assert.equal(trackLabel('', 'nl', 'captions'), 'NL');
    assert.equal(trackLabel('', '', 'captions'), 'Captions');
});

test('cue text loses WebVTT tags and entities, keeps line breaks', () => {
    assert.equal(cleanCueText('<v Anchor><i>Good  evening</i></v>\nand &amp; welcome'), 'Good evening\nand & welcome');
    assert.equal(cleanCueText('&lt;music&gt;&nbsp;'), '<music>');
    assert.equal(cleanCueText('  \n  '), '');
});

test('CEA-608 rows show top to bottom, without repeats', () => {
    const cues = [
        { start: 1, end: 5, line: 15, text: 'second row' },
        { start: 1, end: 5, line: 14, text: 'first  row' },
        { start: 2, end: 5, line: 14, text: 'first row' }
    ];
    assert.equal(joinCues(cues), 'first row\nsecond row');
});

test('only cues active at the playhead are shown', () => {
    const cues = [
        { start: 0, end: 2, line: 1, text: 'old' },
        { start: 2, end: 4, line: 1, text: 'now' },
        { start: 4, end: 6, line: 1, text: 'next' }
    ];
    assert.equal(textAt(cues, 2), 'now');
    assert.equal(textAt(cues, 3.9), 'now');
    assert.equal(textAt(cues, 6), '');
});

test('captions placed in the top rows stay at the top', () => {
    assert.equal(atTop([{ line: 1 }, { line: 2 }]), true);
    assert.equal(atTop([{ line: 14 }, { line: 15 }]), false);
    assert.equal(atTop([{ line: 1 }, { line: 15 }]), false);
    assert.equal(atTop([{ line: 0 }]), false); // WebVTT 'auto'
    assert.equal(atTop([]), false);
});

test('remote CC / subtitle keys toggle captions', () => {
    const key = (props) => Object.assign({ key: '', code: '', keyCode: 0, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, props);
    assert.equal(actionOf(key({ key: 'ClosedCaptionToggle' })), 'captions');
    assert.equal(actionOf(key({ key: 'Subtitle' })), 'captions');
    assert.equal(actionOf(key({ key: 'c', code: 'KeyC', keyCode: 67 })), 'char:c');
});
