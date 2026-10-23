// Run with: npm test (node --test tests/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlaylist, buildCategories, prettifyTitle, prettifyGroup, monogram } from '../js/playlist.js';

// Shapes taken from the real feed (renanbazinin/myM3U)
const SAMPLE = '﻿#EXTM3U\r\n'
    + '#EXTINF:-1  tvg-id="11-kanal-il" tvg-logo="https://example.org/kan.png" group-title="Israel",kan 11\r\n'
    + 'https://example.org/kan11.m3u8\r\n'
    + '#EXTINF:-1 tvg-id="13-kanal-il" tvg-logo="https://example.org/13.png" group-title="Israel", reshet 13\n'
    + 'https://example.org/13_hevc/playlist.m3u8?fmp4&renditions\n'
    + '#EXTINF:-1 tvg-id="i24-il" tvg-logo="https://i.imgur.com/x.png" group-title="Israel",i24 hebrew\n'
    + 'https://example.org/i24\n'
    + '#EXTINF:-1 tvg-id="FoxLiveNewsChannel.us" tvg-logo="https://example.org/fox.png" group-title="News" ,Fox Live\n'
    + '#EXTVLCOPT:http-user-agent=Test\n'
    + 'https://example.org/fox.m3u8\n'
    + '#EXTINF:-1 tvg-id="RickAndMorty" tvg-logo="" group-title="TvShowMarathons",Rick and morty (720) HD\n'
    + 'https://example.org/rm720.m3u8\n'
    + '#EXTINF:-1 tvg-id="RickAndMorty" group-title="TvShowMarathons",Rick and morty (360) SD\n'
    + 'https://example.org/rm360.m3u8\n'
    + '#EXTINF:-1 tvg-id="Dup",Same, title\n'
    + 'https://example.org/a.m3u8\n'
    + '#EXTINF:-1 tvg-id="Dup",Same, title\n'
    + 'https://example.org/b.m3u8\n'
    + '#EXTINF:-1 tvg-id="NoUrl",Dangling\n'
    + '#EXTINF:-1 tvg-name="Grouped",Grouped Channel\n'
    + '#EXTGRP:WeatherSki\n'
    + 'https://example.org/g.m3u8\n';

test('parses display titles, ids, numbers and groups', () => {
    const channels = parsePlaylist(SAMPLE);
    assert.deepEqual(channels.map((c) => c.name), [
        'Kan 11', 'Reshet 13', 'i24 Hebrew', 'Fox Live',
        'Rick and morty (720) HD', 'Rick and morty (360) SD',
        'Same, title', 'Same, title', 'Grouped Channel'
    ]);
    assert.deepEqual(channels.map((c) => c.number), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.equal(channels[0].id, '11-kanal-il');
    assert.equal(channels[3].group, 'News');
    assert.equal(channels[3].url, 'https://example.org/fox.m3u8');
    assert.equal(channels[4].groupLabel, 'TV Show Marathons');
    assert.equal(channels[8].group, 'WeatherSki');
    assert.equal(channels[8].groupLabel, 'Weather Ski');
});

test('keeps channels without logos and drops entries without a URL', () => {
    const channels = parsePlaylist(SAMPLE);
    assert.equal(channels[4].logo, '');
    assert.equal(channels[5].logo, '');
    assert.ok(!channels.some((c) => c.id === 'NoUrl'));
});

test('stable keys are unique even when tvg-id and title repeat', () => {
    const channels = parsePlaylist(SAMPLE);
    const keys = channels.map((c) => c.key);
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(channels[0].key, '11-kanal-il|kan 11');
    assert.equal(channels[1].key, '13-kanal-il|reshet 13');
    assert.equal(channels[6].key, 'Dup|same, title');
    assert.equal(channels[7].key, 'Dup|same, title#2');
    assert.equal(channels[8].key, '_|grouped channel');
});

test('keys survive reordering and URL changes', () => {
    const reordered = parsePlaylist(SAMPLE.replace('kan11.m3u8', 'kan11-new.m3u8'));
    assert.equal(reordered[0].key, '11-kanal-il|kan 11');
});

test('categories keep first-seen order with counts', () => {
    const categories = buildCategories(parsePlaylist(SAMPLE));
    assert.deepEqual(categories.map((c) => [c.id, c.count]), [
        ['Israel', 3], ['News', 1], ['TvShowMarathons', 2], ['Other', 2], ['WeatherSki', 1]
    ]);
});

test('prettifiers', () => {
    assert.equal(prettifyTitle('  now   14 '), 'Now 14');
    assert.equal(prettifyTitle('knesset'), 'Knesset');
    assert.equal(prettifyTitle('CNN International'), 'CNN International');
    assert.equal(prettifyGroup('TvShowMarathons'), 'TV Show Marathons');
    assert.equal(prettifyGroup(''), 'Other');
    assert.equal(monogram('Bloomberg TV+ UHD'), 'BT');
    assert.equal(monogram('knesset'), 'KN');
});
