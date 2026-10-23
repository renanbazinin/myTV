// Run with: npm test (node --test tests/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { toAvcUrl, needsResolver } from '../js/streams.js';
import { normalizeLogoUrl } from '../js/ui/logo.js';

test('Firefox H.264 rewrite keeps the query string valid', () => {
    assert.equal(
        toAvcUrl('https://cdn.example/keshet_12_hevc/live.livx/playlist.m3u8?fmp4&renditions&dvr=28800000'),
        'https://cdn.example/keshet_12/live.livx/playlist.m3u8?renditions&dvr=28800000'
    );
    assert.equal(toAvcUrl('https://cdn.example/x_hevc/playlist.m3u8?a=1&fmp4'), 'https://cdn.example/x/playlist.m3u8?a=1');
    assert.equal(toAvcUrl('https://cdn.example/x_hevc/playlist.m3u8?fmp4'), 'https://cdn.example/x/playlist.m3u8');
});

test('special channels are resolved by tvg-id', () => {
    assert.equal(needsResolver({ id: 'i24-il' }), true);
    assert.equal(needsResolver({ id: 'i24-en' }), true);
    assert.equal(needsResolver({ id: '11-kanal-il' }), false);
    assert.equal(needsResolver(null), false);
});

test('Wikimedia logos use the standard 330px thumbnail', () => {
    assert.equal(
        normalizeLogoUrl('https://upload.wikimedia.org/wikipedia/he/thumb/4/43/Knessetch10.svg/1200px-Knessetch10.svg.png'),
        'https://upload.wikimedia.org/wikipedia/he/thumb/4/43/Knessetch10.svg/330px-Knessetch10.svg.png'
    );
    assert.equal(normalizeLogoUrl('https://i.imgur.com/hnGgzEf.png'), 'https://i.imgur.com/hnGgzEf.png');
    assert.equal(normalizeLogoUrl(''), '');
});
