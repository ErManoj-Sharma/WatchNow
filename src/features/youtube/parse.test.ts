import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parsePlaylistId } from './parse';

test('standard playlist page', () => {
  assert.equal(
    parsePlaylistId('https://www.youtube.com/playlist?list=PLbpi6ZahtOH6Blw3RGYpWkSByi_T7Rygb'),
    'PLbpi6ZahtOH6Blw3RGYpWkSByi_T7Rygb',
  );
});

test('watch URL with a list param', () => {
  assert.equal(
    parsePlaylistId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890abcdefghijk&index=3'),
    'PL1234567890abcdefghijk',
  );
});

test('short youtu.be link with list', () => {
  assert.equal(
    parsePlaylistId('https://youtu.be/dQw4w9WgXcQ?list=UUmB9Bl9B2zQhRQwF0Nc8xLQ'),
    'UUmB9Bl9B2zQhRQwF0Nc8xLQ',
  );
});

test('mobile and music hosts', () => {
  assert.equal(
    parsePlaylistId('https://m.youtube.com/playlist?list=PLabc123def456ghi789jkl'),
    'PLabc123def456ghi789jkl',
  );
  assert.equal(
    parsePlaylistId('https://music.youtube.com/playlist?list=RDAMVMdQw4w9WgXcQ'),
    'RDAMVMdQw4w9WgXcQ',
  );
});

test('protocol-less and extra whitespace', () => {
  assert.equal(
    parsePlaylistId('  youtube.com/playlist?list=PLabcdef1234567890xyz  '),
    'PLabcdef1234567890xyz',
  );
});

test('bare playlist id pasted on its own', () => {
  assert.equal(parsePlaylistId('PLbpi6ZahtOH6Blw3RGYpWkSByi_T7Rygb'), 'PLbpi6ZahtOH6Blw3RGYpWkSByi_T7Rygb');
  assert.equal(parsePlaylistId('UUuAXFgswUNL9JcO2qxhaTig'), 'UUuAXFgswUNL9JcO2qxhaTig');
});

test('non-playlist YouTube URLs are rejected', () => {
  assert.equal(parsePlaylistId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(parsePlaylistId('https://www.youtube.com/@somechannel'), null);
  assert.equal(parsePlaylistId('https://youtu.be/dQw4w9WgXcQ'), null);
});

test('non-YouTube and junk input are rejected', () => {
  assert.equal(parsePlaylistId('https://vimeo.com/12345'), null);
  assert.equal(parsePlaylistId('https://youtube.com.evil.com/playlist?list=PLabcdef1234567890xyz'), null);
  assert.equal(parsePlaylistId('not a url at all'), null);
  assert.equal(parsePlaylistId(''), null);
  assert.equal(parsePlaylistId('   '), null);
});

test('ids that are too short or lack a recognised prefix are rejected', () => {
  assert.equal(parsePlaylistId('PLshort'), null);
  assert.equal(parsePlaylistId('XXbpi6ZahtOH6Blw3RGYpWkSByi_T7Rygb'), null);
});
