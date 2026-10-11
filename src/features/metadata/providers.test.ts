import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { tvmazePoster, tmdbPoster } from './providers';

function jsonFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as Response) as typeof fetch;
}

test('tmdbPoster accepts a strict title/year match', async () => {
  const fetchImpl = jsonFetch({
    results: [{ title: 'The Matrix', poster_path: '/poster.jpg', release_date: '1999-03-31' }],
  });
  const hit = await tmdbPoster('The.Matrix.1999', 'movie', 'KEY', 1999, fetchImpl);
  assert.equal(hit?.posterUrl, 'https://image.tmdb.org/t/p/w500/poster.jpg');
  assert.equal(hit?.source, 'tmdb');
});

test('tmdbPoster rejects a year mismatch', async () => {
  const fetchImpl = jsonFetch({
    results: [{ title: 'Dune', poster_path: '/poster.jpg', release_date: '1984-12-14' }],
  });
  const hit = await tmdbPoster('Dune.2021', 'movie', 'KEY', 2021, fetchImpl);
  assert.equal(hit, null);
});

test('providers throw stop=true on 429/401', async () => {
  const fetchImpl = jsonFetch({}, 429);
  await assert.rejects(
    () => tmdbPoster('Any', 'movie', 'KEY', null, fetchImpl),
    (e: { stop?: boolean }) => e.stop === true,
  );
});

test('tvmazePoster matches shows without a key', async () => {
  const fetchImpl = jsonFetch([
    { show: { name: 'Breaking Bad', image: { original: 'https://static.tvmaze.com/x.jpg' }, premiered: '2008-01-20' } },
  ]);
  const hit = await tvmazePoster('Breaking.Bad', 2008, fetchImpl);
  assert.equal(hit?.posterUrl, 'https://static.tvmaze.com/x.jpg');
  assert.equal(hit?.source, 'tvmaze');
});
