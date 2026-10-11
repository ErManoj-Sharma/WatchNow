import { getDb } from '@/db/database';
import type { ApiVideoRow, PlaylistMeta } from './api';

export type YoutubePlaylist = {
  id: number;
  playlistId: string;
  url: string;
  title: string;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  videoCount: number;
  createdAt: number;
  syncedAt: number | null;
};

export type YoutubeVideo = {
  id: number;
  playlistId: number;
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  position: number;
  positionMs: number | null;
  completed: number;
  lastPlayedAt: number | null;
};

const PLAYLIST_COLUMNS = `id, playlist_id AS playlistId, url, title,
  channel_title AS channelTitle, thumbnail_url AS thumbnailUrl,
  video_count AS videoCount, created_at AS createdAt, synced_at AS syncedAt`;

const VIDEO_COLUMNS = `id, playlist_id AS playlistId, video_id AS videoId, title,
  thumbnail_url AS thumbnailUrl, duration_seconds AS durationSeconds,
  position, position_ms AS positionMs, completed, last_played_at AS lastPlayedAt`;

export async function listPlaylists(): Promise<YoutubePlaylist[]> {
  const db = await getDb();
  return db.getAllAsync<YoutubePlaylist>(
    `SELECT ${PLAYLIST_COLUMNS} FROM youtube_playlist ORDER BY created_at DESC`,
  );
}

export async function getPlaylist(id: number): Promise<YoutubePlaylist | null> {
  const db = await getDb();
  return db.getFirstAsync<YoutubePlaylist>(
    `SELECT ${PLAYLIST_COLUMNS} FROM youtube_playlist WHERE id = ?`,
    id,
  );
}

export async function getPlaylistVideos(playlistId: number): Promise<YoutubeVideo[]> {
  const db = await getDb();
  return db.getAllAsync<YoutubeVideo>(
    `SELECT ${VIDEO_COLUMNS} FROM youtube_video WHERE playlist_id = ? ORDER BY position`,
    playlistId,
  );
}

/**
 * Upserts a playlist and replaces its video list in one transaction.
 * Progress (position_ms/completed) survives for videos that are still in
 * the playlist; videos YouTube removed since the last sync are dropped.
 */
export async function savePlaylist(meta: PlaylistMeta, url: string, items: ApiVideoRow[]): Promise<number> {
  const db = await getDb();
  const now = Date.now();
  let playlistRowId = 0;
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO youtube_playlist (playlist_id, url, title, channel_title, thumbnail_url, video_count, created_at, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(playlist_id) DO UPDATE SET
         url = excluded.url,
         title = excluded.title,
         channel_title = excluded.channel_title,
         thumbnail_url = excluded.thumbnail_url,
         video_count = excluded.video_count,
         synced_at = excluded.synced_at`,
      meta.playlistId,
      url,
      meta.title,
      meta.channelTitle,
      meta.thumbnailUrl,
      items.length,
      now,
      now,
    );
    const row = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM youtube_playlist WHERE playlist_id = ?',
      meta.playlistId,
    );
    playlistRowId = row!.id;

    const keep = items.map((i) => i.videoId);
    if (keep.length > 0) {
      await db.runAsync(
        `DELETE FROM youtube_video WHERE playlist_id = ? AND video_id NOT IN (${keep.map(() => '?').join(',')})`,
        playlistRowId,
        ...keep,
      );
    } else {
      await db.runAsync('DELETE FROM youtube_video WHERE playlist_id = ?', playlistRowId);
    }
    for (const item of items) {
      await db.runAsync(
        `INSERT INTO youtube_video (playlist_id, video_id, title, thumbnail_url, duration_seconds, position)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(playlist_id, video_id) DO UPDATE SET
           title = excluded.title,
           thumbnail_url = excluded.thumbnail_url,
           duration_seconds = COALESCE(excluded.duration_seconds, youtube_video.duration_seconds),
           position = excluded.position`,
        playlistRowId,
        item.videoId,
        item.title,
        item.thumbnailUrl,
        item.durationSeconds,
        item.position,
      );
    }
  });
  return playlistRowId;
}

export async function deletePlaylist(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM youtube_playlist WHERE id = ?', id);
}

/** Same 95%-complete / resume conventions as the local playback_progress table. */
export async function saveVideoProgress(
  videoRowId: number,
  positionMs: number,
  durationSeconds: number | null,
  completed?: boolean,
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const durationMs = durationSeconds != null ? durationSeconds * 1000 : null;
  const done =
    completed ?? (durationMs != null && durationMs > 0 && positionMs / durationMs >= 0.95);
  await db.runAsync(
    `UPDATE youtube_video
     SET position_ms = ?, completed = ?, last_played_at = ?
     WHERE id = ?`,
    Math.round(positionMs),
    done ? 1 : 0,
    now,
    videoRowId,
  );
}
