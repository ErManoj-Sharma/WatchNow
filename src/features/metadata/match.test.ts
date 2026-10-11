import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { extractYear, isMetadataMatch, normalizeTitle, queryTitleOf } from './match';

test('extractYear finds the last 19xx/20xx token', () => {
  assert.equal(extractYear('Movie.2010.1080p'), 2010);
  assert.equal(extractYear('The.Matrix.1999.BluRay'), 1999);
  assert.equal(extractYear('2001.A.Space.Odyssey.1968.1080p'), 1968);
  assert.equal(extractYear('No Year Here'), null);
  assert.equal(extractYear('Show.S02E05.720p'), null);
});

test('normalizeTitle strips extensions, quality, year, episode tokens', () => {
  assert.equal(normalizeTitle('The.Matrix.1999.1080p.BluRay.x264.mkv'), 'the matrix');
  assert.equal(normalizeTitle('Movie (2010) [Web-DL].mp4'), 'movie');
  assert.equal(normalizeTitle('Show.Name.S01E03.720p.mkv'), 'show name');
});

test('exact normalized title matches', () => {
  assert.equal(isMetadataMatch('The.Matrix.1999', 'The Matrix', 1999, 1999), true);
  assert.equal(isMetadataMatch('Inception (2010)', 'Inception', 2010, 2010), true);
});

test('year mismatch beyond ±1 rejects', () => {
  assert.equal(isMetadataMatch('Dune.2021', 'Dune', 2021, 1984), false);
  assert.equal(isMetadataMatch('Dune.2021', 'Dune', 2021, 2022), true);
});

test('missing years on either side skip the year check', () => {
  assert.equal(isMetadataMatch('Dune', 'Dune', null, 2021), true);
  assert.equal(isMetadataMatch('Dune.2021', 'Dune', 2021, null), true);
});

test('short-token containment is rejected, long containment accepted', () => {
  assert.equal(isMetadataMatch('Up.2009', 'Up', 2009, 2009), true);
  assert.equal(isMetadataMatch('It', 'It Comes at Night', null, 2017), false);
  assert.equal(isMetadataMatch('Blade Runner 2049', 'Blade Runner', null, null), true);
});

test('unrelated titles never match', () => {
  assert.equal(isMetadataMatch('The Dark Knight.2008', 'The Matrix', 2008, 1999), false);
});

test('queryTitleOf strips year and quality but keeps title case', () => {
  assert.equal(queryTitleOf('Premalu 2024'), 'Premalu');
  assert.equal(queryTitleOf('The.Matrix.1999.1080p.BluRay.x264'), 'The Matrix');
  assert.equal(queryTitleOf('Matchbox The Movie 2026'), 'Matchbox The Movie');
});
