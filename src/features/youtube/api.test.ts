import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mapPlaylistItems, mapPlaylistMeta, mapVideoDurations, parseIsoDuration, pickThumbnail } from './api';

const THUMBNAILS = {
  default: { url: 'https://i.ytimg.com/vi/abc/default.jpg', width: 120, height: 90 },
  medium: { url: 'https://i.ytimg.com/vi/abc/mqdefault.jpg', width: 320, height: 180 },
  high: { url: 'https://i.ytimg.com/vi/abc/hqdefault.jpg', width: 480, height: 360 },
  maxres: { url: 'https://i.ytimg.com/vi/abc/maxresdefault.jpg', width: 1280, height: 720 },
};

test('pickThumbnail prefers the largest available and falls back', () => {
  assert.equal(pickThumbnail(THUMBNAILS), 'https://i.ytimg.com/vi/abc/maxresdefault.jpg');
  assert.equal(pickThumbnail({ ...THUMBNAILS, maxres: undefined }), 'https://i.ytimg.com/vi/abc/hqdefault.jpg');
  assert.equal(pickThumbnail({ default: THUMBNAILS.default }), 'https://i.ytimg.com/vi/abc/default.jpg');
  assert.equal(pickThumbnail({}), null);
  assert.equal(pickThumbnail(undefined), null);
  assert.equal(pickThumbnail(null), null);
});

test('parseIsoDuration converts ISO-8601 to seconds', () => {
  assert.equal(parseIsoDuration('PT1H2M3S'), 3723);
  assert.equal(parseIsoDuration('PT15M33S'), 933);
  assert.equal(parseIsoDuration('PT45S'), 45);
  assert.equal(parseIsoDuration('PT2H'), 7200);
  assert.equal(parseIsoDuration('P1DT2H3M4S'), 93784);
  assert.equal(parseIsoDuration('PT0S'), 0);
  assert.equal(parseIsoDuration(''), null);
  assert.equal(parseIsoDuration(null), null);
  assert.equal(parseIsoDuration('garbage'), null);
});

test('mapPlaylistItems drops deleted and private entries, keeps order', () => {
  const rows = mapPlaylistItems({
    items: [
      { snippet: { title: 'Ep 1', thumbnails: THUMBNAILS }, contentDetails: { videoId: 'vid000000001' } },
      { snippet: { title: 'Deleted video' }, contentDetails: { videoId: 'vid000000002' } },
      { snippet: { title: 'Private video' }, contentDetails: { videoId: 'vid000000003' } },
      { snippet: { title: 'Ep 4', thumbnails: THUMBNAILS }, contentDetails: { videoId: 'vid000000004' } },
      { snippet: { title: 'No id row' } },
    ],
  });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.videoId), ['vid000000001', 'vid000000004']);
  assert.deepEqual(rows.map((r) => r.position), [0, 1]);
  assert.equal(rows[0].title, 'Ep 1');
  assert.equal(rows[0].thumbnailUrl, 'https://i.ytimg.com/vi/abc/maxresdefault.jpg');
  assert.equal(rows[0].durationSeconds, null);
});

test('mapPlaylistItems numbering continues across pages', () => {
  const rows = mapPlaylistItems(
    { items: [{ snippet: { title: 'Next page ep' }, contentDetails: { videoId: 'vid000000005' } }] },
    42,
  );
  assert.equal(rows[0].position, 42);
});

test('mapPlaylistItems handles an empty page', () => {
  assert.deepEqual(mapPlaylistItems({}), []);
  assert.deepEqual(mapPlaylistItems({ items: [] }), []);
});

test('mapPlaylistMeta maps a full response', () => {
  const meta = mapPlaylistMeta(
    {
      items: [
        {
          id: 'PLtest123',
          snippet: { title: 'My Web Show', channelTitle: 'Some Channel', thumbnails: THUMBNAILS },
          contentDetails: { itemCount: 24 },
        },
      ],
    },
  );
  assert.deepEqual(meta, {
    playlistId: 'PLtest123',
    title: 'My Web Show',
    channelTitle: 'Some Channel',
    thumbnailUrl: 'https://i.ytimg.com/vi/abc/maxresdefault.jpg',
    videoCount: 24,
  });
});

test('mapPlaylistMeta tolerates missing optional fields and returns null when absent', () => {
  const meta = mapPlaylistMeta({ items: [{ id: 'PLx' }] });
  assert.equal(meta?.title, 'Untitled playlist');
  assert.equal(meta?.channelTitle, null);
  assert.equal(meta?.thumbnailUrl, null);
  assert.equal(meta?.videoCount, 0);
  assert.equal(mapPlaylistMeta({}), null);
  assert.equal(mapPlaylistMeta({ items: [] }), null);
});

test('mapVideoDurations ignores zero and missing durations', () => {
  const map = mapVideoDurations({
    items: [
      { id: 'vid000000001', contentDetails: { duration: 'PT10M' } },
      { id: 'vid000000002', contentDetails: { duration: 'PT0S' } },
      { id: 'vid000000003', contentDetails: {} },
      { contentDetails: { duration: 'PT5S' } },
      { id: 'vid000000004', contentDetails: { duration: 'PT1H' } },
    ],
  });
  assert.equal(map.get('vid000000001'), 600);
  assert.equal(map.get('vid000000004'), 3600);
  assert.equal(map.size, 2);
});
