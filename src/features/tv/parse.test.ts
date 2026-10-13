import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { defaultPlaylistName, parseM3u } from './parse';

const CHANNELS_M3U = `#EXTM3U
#EXTINF:-1 tvg-id="AajTak.in@SD" tvg-logo="https://example.com/aajtak.png" group-title="News",Aaj Tak (1080p)
http://example.com/aajtak/index.m3u8
#EXTINF:-1 tvg-logo="" group-title="Music",9X Jalwa
https://example.com/9xjalwa/master.m3u8
`;

test('parseM3u extracts channels with logo and group', () => {
  const result = parseM3u(CHANNELS_M3U, 'https://cdn.example/hin.m3u');
  assert.equal(result.kind, 'channels');
  if (result.kind !== 'channels') return;
  assert.equal(result.channels.length, 2);
  assert.deepEqual(result.channels[0], {
    name: 'Aaj Tak (1080p)',
    streamUrl: 'http://example.com/aajtak/index.m3u8',
    logoUrl: 'https://example.com/aajtak.png',
    groupName: 'News',
  });
  assert.equal(result.channels[1].name, '9X Jalwa');
  assert.equal(result.channels[1].logoUrl, null);
});

test('parseM3u detects a raw HLS master as a single playable source', () => {
  const hls = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000
http://example.com/low.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2000000
http://example.com/high.m3u8
`;
  const result = parseM3u(hls, 'http://example.com/master.m3u8');
  assert.deepEqual(result, { kind: 'hls', url: 'http://example.com/master.m3u8' });
});

test('parseM3u rejects junk', () => {
  assert.equal(parseM3u('hello world', 'u').kind, 'invalid');
  assert.equal(parseM3u('', 'u').kind, 'invalid');
  assert.equal(parseM3u('#EXTINF without a url line', 'u').kind, 'invalid');
});

test('defaultPlaylistName uses file name for lists and host for HLS', () => {
  assert.equal(defaultPlaylistName('https://iptv-org.github.io/iptv/languages/hin.m3u', 'channels'), 'hin');
  assert.equal(defaultPlaylistName('https://example.com/live/master.m3u8', 'hls'), 'example.com');
});
