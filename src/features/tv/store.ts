import { getDb } from '@/db/database';

import type { ParsedChannel } from './parse';

export type TvPlaylist = {
  id: number;
  url: string;
  name: string;
  channelCount: number;
  createdAt: number;
  syncedAt: number | null;
};

export type TvChannel = {
  id: number;
  playlistId: number;
  name: string;
  streamUrl: string;
  logoUrl: string | null;
  groupName: string | null;
  favorite: number;
};

const PLAYLIST_COLUMNS = `id, url, name, channel_count AS channelCount,
  created_at AS createdAt, synced_at AS syncedAt`;

const CHANNEL_SELECT = `SELECT c.id, c.playlist_id AS playlistId, c.name, c.stream_url AS streamUrl,
  c.logo_url AS logoUrl, c.group_name AS groupName,
  f.stream_url IS NOT NULL AS favorite
  FROM tv_channel c
  LEFT JOIN tv_favorite f ON f.stream_url = c.stream_url`;

export async function listTvPlaylists(): Promise<TvPlaylist[]> {
  const db = await getDb();
  return db.getAllAsync<TvPlaylist>(
    `SELECT ${PLAYLIST_COLUMNS} FROM tv_playlist ORDER BY created_at DESC`,
  );
}

export async function listTvChannels(search?: string, onlyFavorites = false): Promise<TvChannel[]> {
  const db = await getDb();
  const q = (search ?? '').trim();
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (onlyFavorites) where.push('favorite');
  if (q) {
    where.push('(c.name LIKE ? OR c.group_name LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  const sql = `${CHANNEL_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY c.name`;
  return db.getAllAsync<TvChannel>(sql, ...params);
}

/** Set a channel's favorite flag (keyed by stream_url so it survives re-sync). */
export async function setTvFavorite(streamUrl: string, favorite: boolean): Promise<void> {
  const db = await getDb();
  if (favorite) {
    await db.runAsync(
      'INSERT OR IGNORE INTO tv_favorite (stream_url, created_at) VALUES (?, ?)',
      streamUrl,
      Date.now(),
    );
  } else {
    await db.runAsync('DELETE FROM tv_favorite WHERE stream_url = ?', streamUrl);
  }
}

/** Upsert a playlist by URL and replace its channel list in one transaction. */
export async function saveTvPlaylist(
  url: string,
  name: string,
  channels: ParsedChannel[],
): Promise<number> {
  const db = await getDb();
  const now = Date.now();
  let rowId = 0;
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO tv_playlist (url, name, channel_count, created_at, synced_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET
         name = excluded.name,
         channel_count = excluded.channel_count,
         synced_at = excluded.synced_at`,
      url,
      name,
      channels.length,
      now,
      now,
    );
    const row = await db.getFirstAsync<{ id: number }>('SELECT id FROM tv_playlist WHERE url = ?', url);
    rowId = row!.id;
    await db.runAsync('DELETE FROM tv_channel WHERE playlist_id = ?', rowId);
    for (const c of channels) {
      await db.runAsync(
        `INSERT INTO tv_channel (playlist_id, name, stream_url, logo_url, group_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        rowId,
        c.name,
        c.streamUrl,
        c.logoUrl,
        c.groupName,
        now,
      );
    }
  });
  return rowId;
}

export async function deleteTvPlaylist(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM tv_playlist WHERE id = ?', id);
}
