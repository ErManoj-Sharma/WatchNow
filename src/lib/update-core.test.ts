import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { compareSemver, parseLatestRelease } from './update-core';

test('compareSemver orders dotted versions', () => {
  assert.equal(compareSemver('1.1.0', '1.1.0'), 0);
  assert.equal(compareSemver('1.1.0', '1.0.9'), 1);
  assert.equal(compareSemver('1.0.9', '1.1.0'), -1);
  assert.equal(compareSemver('1.10.0', '1.9.9'), 1);
  assert.equal(compareSemver('2', '1.9.9'), 1);
  assert.equal(compareSemver('1.1', '1.1.0'), 0);
});

test('parseLatestRelease strips the v prefix and picks the APK asset', () => {
  const release = parseLatestRelease({
    tag_name: 'v1.1.0',
    html_url: 'https://github.com/x/y/releases/tag/1.1.0',
    assets: [
      { name: 'source.zip', id: 1 },
      { name: 'WatchNow.apk', id: 2 },
    ],
  });
  assert.deepEqual(release, {
    version: '1.1.0',
    url: 'https://github.com/x/y/releases/tag/1.1.0',
    assetId: 2,
  });
});

test('parseLatestRelease tolerates a release without an APK', () => {
  const release = parseLatestRelease({ tag_name: '1.2.0', html_url: 'u', assets: [] });
  assert.equal(release?.version, '1.2.0');
  assert.equal(release?.assetId, null);
});

test('parseLatestRelease rejects a missing tag', () => {
  assert.equal(parseLatestRelease({ tag_name: '  ', assets: [] }), null);
  assert.equal(parseLatestRelease(null), null);
  assert.equal(parseLatestRelease({}), null);
});
