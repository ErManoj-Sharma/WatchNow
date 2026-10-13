import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { MIGRATIONS } from './schema';

function migrate(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of MIGRATIONS) db.exec(m.sql);
  return db;
}

test('migrations apply in order and land on user_version 9', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of MIGRATIONS) {
    db.exec(m.sql);
    db.exec(`PRAGMA user_version = ${m.version}`);
  }
  const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  assert.equal(user_version, 9);
});

test('library_entry has an imdb_id column for series', () => {
  const db = migrate();
  const cols = db
    .prepare('PRAGMA table_info(library_entry)')
    .all()
    .map((r) => (r as { name: string }).name);
  assert.ok(cols.includes('imdb_id'), 'library_entry.imdb_id missing');
});

test('youtube tables exist with expected columns', () => {
  const db = migrate();
  const playlistCols = db
    .prepare('PRAGMA table_info(youtube_playlist)')
    .all()
    .map((r) => (r as { name: string }).name);
  for (const col of ['playlist_id', 'title', 'thumbnail_url', 'video_count', 'synced_at']) {
    assert.ok(playlistCols.includes(col), `youtube_playlist.${col} missing`);
  }
  const videoCols = db
    .prepare('PRAGMA table_info(youtube_video)')
    .all()
    .map((r) => (r as { name: string }).name);
  for (const col of ['playlist_id', 'video_id', 'title', 'thumbnail_url', 'duration_seconds', 'position', 'position_ms', 'completed']) {
    assert.ok(videoCols.includes(col), `youtube_video.${col} missing`);
  }
});

test('youtube tables are isolated from the local library tables', () => {
  const db = migrate();
  const root = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('library_entry','media_item','scan_root')",
    )
    .all();
  assert.equal(root.length, 3);
  const localCols = db
    .prepare('PRAGMA table_info(library_entry)')
    .all()
    .map((r) => (r as { name: string }).name);
  assert.ok(!localCols.includes('youtube_playlist_id'));
});

test('deleting a playlist cascades to its videos', () => {
  const db = migrate();
  db.prepare(
    `INSERT INTO youtube_playlist (playlist_id, url, title, created_at) VALUES (?, ?, ?, ?)`,
  ).run('PLtest', 'https://youtube.com/playlist?list=PLtest', 'Test Playlist', Date.now());
  const { id } = db.prepare('SELECT id FROM youtube_playlist').get() as { id: number };
  const insertVideo = db.prepare(
    `INSERT INTO youtube_video (playlist_id, video_id, title, position, duration_seconds)
     VALUES (?, ?, ?, ?, ?)`,
  );
  insertVideo.run(id, 'vid00000001', 'Ep 1', 0, 600);
  insertVideo.run(id, 'vid00000002', 'Ep 2', 1, 700);
  assert.equal((db.prepare('SELECT COUNT(*) c FROM youtube_video').get() as { c: number }).c, 2);

  db.exec('DELETE FROM youtube_playlist');
  assert.equal((db.prepare('SELECT COUNT(*) c FROM youtube_video').get() as { c: number }).c, 0);
});

test('a video id is unique within a playlist but reusable across playlists', () => {
  const db = migrate();
  const insert = db.prepare(
    `INSERT INTO youtube_playlist (playlist_id, url, title, created_at) VALUES (?, ?, ?, ?)`,
  );
  insert.run('PLa', 'u', 'A', 1);
  insert.run('PLb', 'u', 'B', 1);
  const [a, b] = db.prepare('SELECT id FROM youtube_playlist ORDER BY id').all() as { id: number }[];

  const insertVideo = db.prepare(
    `INSERT INTO youtube_video (playlist_id, video_id, title, position) VALUES (?, ?, ?, ?)`,
  );
  insertVideo.run(a.id, 'sharedVideoId', 'same video', 0);
  insertVideo.run(b.id, 'sharedVideoId', 'same video', 0);
  assert.equal((db.prepare('SELECT COUNT(*) c FROM youtube_video').get() as { c: number }).c, 2);

  assert.throws(() => insertVideo.run(a.id, 'sharedVideoId', 'dupe', 1), /UNIQUE/i);
});

test('tv tables exist and deleting a playlist cascades to its channels', () => {
  const db = migrate();
  const playlistCols = db
    .prepare('PRAGMA table_info(tv_playlist)')
    .all()
    .map((r) => (r as { name: string }).name);
  for (const col of ['url', 'name', 'channel_count', 'synced_at']) {
    assert.ok(playlistCols.includes(col), `tv_playlist.${col} missing`);
  }
  const channelCols = db
    .prepare('PRAGMA table_info(tv_channel)')
    .all()
    .map((r) => (r as { name: string }).name);
  for (const col of ['playlist_id', 'name', 'stream_url', 'logo_url', 'group_name']) {
    assert.ok(channelCols.includes(col), `tv_channel.${col} missing`);
  }

  db.prepare('INSERT INTO tv_playlist (url, name, channel_count, created_at) VALUES (?, ?, ?, ?)').run(
    'https://cdn.example/hin.m3u',
    'hin',
    2,
    1,
  );
  const { id } = db.prepare('SELECT id FROM tv_playlist').get() as { id: number };
  const insertChannel = db.prepare(
    'INSERT INTO tv_channel (playlist_id, name, stream_url, created_at) VALUES (?, ?, ?, ?)',
  );
  insertChannel.run(id, 'Aaj Tak', 'http://example.com/a.m3u8', 1);
  insertChannel.run(id, '9X Jalwa', 'http://example.com/b.m3u8', 1);
  assert.equal((db.prepare('SELECT COUNT(*) c FROM tv_channel').get() as { c: number }).c, 2);

  db.exec('DELETE FROM tv_playlist');
  assert.equal((db.prepare('SELECT COUNT(*) c FROM tv_channel').get() as { c: number }).c, 0);
});

test('tv_favorite survives a channel re-sync (keyed by stream_url)', () => {
  const db = migrate();
  db.prepare('INSERT INTO tv_playlist (url, name, channel_count, created_at) VALUES (?, ?, ?, ?)').run(
    'u', 'hin', 1, 1,
  );
  const { id } = db.prepare('SELECT id FROM tv_playlist').get() as { id: number };
  db.prepare('INSERT INTO tv_channel (playlist_id, name, stream_url, created_at) VALUES (?, ?, ?, ?)').run(
    id, 'Aaj Tak', 'http://example.com/a.m3u8', 1,
  );
  // favorite the channel by stream_url
  db.prepare('INSERT INTO tv_favorite (stream_url, created_at) VALUES (?, ?)').run('http://example.com/a.m3u8', 1);

  // re-sync: delete + reinsert channels (as saveTvPlaylist does)
  db.exec('DELETE FROM tv_channel');
  db.prepare('INSERT INTO tv_channel (playlist_id, name, stream_url, created_at) VALUES (?, ?, ?, ?)').run(
    id, 'Aaj Tak', 'http://example.com/a.m3u8', 2,
  );

  const { fav } = db
    .prepare('SELECT f.stream_url IS NOT NULL AS fav FROM tv_channel c LEFT JOIN tv_favorite f ON f.stream_url = c.stream_url')
    .get() as { fav: number };
  assert.equal(fav, 1);
});
