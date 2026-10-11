import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyLibrary } from './classify';
import type { ScannedFile } from './types';

function files(...paths: string[]): ScannedFile[] {
  return paths.map((p) => ({
    relativePath: p,
    fileName: p.split('/').pop() ?? p,
    sizeBytes: 1_000_000,
    uri: `content://test/${p}`,
    modifiedAt: 1_700_000_000_000,
  }));
}

test('Fixture A: standalone movies', () => {
  const lib = classifyLibrary(files('Film A.mp4', 'Film B.mkv'));
  assert.equal(lib.movies.length, 2);
  assert.equal(lib.series.length, 0);
  const titles = lib.movies.map((m) => m.title).sort();
  assert.deepEqual(titles, ['Film A', 'Film B']);
  assert.ok(lib.movies.every((m) => !m.needsReview));
});

test('Fixture B: standard series', () => {
  const lib = classifyLibrary(
    files('Panchayat/Season 1/S01E01.mkv', 'Panchayat/Season 1/S01E02.mkv'),
  );
  assert.equal(lib.series.length, 1);
  assert.equal(lib.movies.length, 0);
  const s = lib.series[0];
  assert.equal(s.title, 'Panchayat');
  assert.equal(s.episodes.length, 2);
  assert.deepEqual(
    s.episodes.map((e) => [e.seasonNumber, e.episodeNumber]),
    [
      [1, 1],
      [1, 2],
    ],
  );
});

test('Fixture C: nested technical directories', () => {
  const lib = classifyLibrary(files('Show/1080p/Season 2/Show.S02E03.mkv'));
  assert.equal(lib.series.length, 1);
  const s = lib.series[0];
  assert.equal(s.title, 'Show');
  assert.equal(s.episodes.length, 1);
  assert.equal(s.episodes[0].seasonNumber, 2);
  assert.equal(s.episodes[0].episodeNumber, 3);
  assert.equal(s.title.toLowerCase().includes('1080p'), false);
});

test('Fixture D: flat episodes', () => {
  const lib = classifyLibrary(
    files('Series X/Episode 1.mp4', 'Series X/Episode 2.mp4', 'Series X/Episode 3.mp4'),
  );
  assert.equal(lib.series.length, 1);
  const s = lib.series[0];
  assert.equal(s.title, 'Series X');
  assert.equal(s.episodes.length, 3);
  assert.deepEqual(
    s.episodes.map((e) => e.episodeNumber),
    [1, 2, 3],
  );
  assert.equal(s.needsReview, false);
});

test('Fixture E: mixed nested layout', () => {
  const lib = classifyLibrary(
    files('Series Y/S01E01.mkv', 'Series Y/Season 2/Episode 02.mkv'),
  );
  assert.equal(lib.series.length, 1);
  const s = lib.series[0];
  assert.equal(s.title, 'Series Y');
  assert.deepEqual(
    s.episodes.map((e) => [e.seasonNumber, e.episodeNumber]),
    [
      [1, 1],
      [2, 2],
    ],
  );
});

test('Fixture F: duplicate quality versions', () => {
  const lib = classifyLibrary(
    files('Series Z/720p/S01E01.mp4', 'Series Z/1080p/S01E01.mkv'),
  );
  assert.equal(lib.series.length, 1);
  const s = lib.series[0];
  assert.equal(s.episodes.length, 1);
  assert.equal(s.episodes[0].files.length, 2);
});

test('Fixture G: movie inside a folder', () => {
  const lib = classifyLibrary(files('Interstellar/Interstellar.mkv', 'Interstellar/subtitles.srt'));
  assert.equal(lib.movies.length, 1);
  assert.equal(lib.series.length, 0);
  assert.equal(lib.movies[0].title, 'Interstellar');
});

test('Fixture H: uncertain filenames stay reviewable', () => {
  const lib = classifyLibrary(files('Unknown/Part 1.mp4', 'Unknown/Part 2.mp4'));
  assert.equal(lib.movies.length + lib.series.length >= 1, true);
  if (lib.series.length > 0) {
    assert.equal(lib.series[0].needsReview, true);
    assert.equal(lib.series[0].confidence < 0.7, true);
    assert.equal(lib.series[0].episodes.length, 2);
  }
});

test('case-insensitive extensions and unsupported files', () => {
  const lib = classifyLibrary(files('Film A.MP4', 'notes.txt', 'Movie.mkv.part'));
  assert.equal(lib.movies.length, 1);
  assert.equal(lib.movies[0].title, 'Film A');
});

test('release year is not an episode number', () => {
  const lib = classifyLibrary(files('Some Film 2023.mkv'));
  assert.equal(lib.movies.length, 1);
  assert.equal(lib.series.length, 0);
  assert.match(lib.movies[0].title, /2023/);
});

test('sample files are skipped', () => {
  const lib = classifyLibrary(files('Movie/sample.mkv', 'Movie/Movie.mkv'));
  assert.equal(lib.movies.length, 1);
  assert.equal(lib.movies[0].title, 'Movie');
});

test('root-level episode creates root series', () => {
  const lib = classifyLibrary(files('Show.S01E01.mkv', 'Show.S01E02.mkv'));
  assert.equal(lib.series.length, 1);
  assert.equal(lib.series[0].episodes.length, 2);
});
