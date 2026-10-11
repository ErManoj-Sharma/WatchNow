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

test('migrations apply in order and land on user_version 4', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of MIGRATIONS) {
    db.exec(m.sql);
    db.exec(`PRAGMA user_version = ${m.version}`);
  }
  const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  assert.equal(user_version, 4);
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
