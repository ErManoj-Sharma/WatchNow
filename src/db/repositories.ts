import { getDb } from './database';
import { sortTitleOf } from '@/features/classification/parse';
import type { SQLiteDatabase } from 'expo-sqlite';

export type ScanRoot = {
  id: number;
  displayName: string;
  documentUri: string;
  permissionPersisted: number;
  lastSuccessfulScanAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type MovieDetail = {
  id: number;
  title: string;
  mediaItemId: number;
  documentUri: string;
  relativePath: string;
  fileName: string;
  sizeBytes: number | null;
  durationMs: number | null;
  thumbnailPath: string | null;
  confidence: number;
  needsReview: number;
  positionMs: number | null;
  completed: number | null;
  isFavorite: number;
  classificationSource: string;
};

export type SeriesSummary = {
  id: number;
  title: string;
  thumbnailPath: string | null;
  episodeCount: number;
  needsReview: number;
  confidence: number;
};

export type MovieSummary = {
  id: number;
  title: string;
  mediaItemId: number;
  thumbnailPath: string | null;
  documentUri: string;
  durationMs: number | null;
  sizeBytes: number | null;
  fileName: string;
  needsReview: number;
};

export type EpisodeRow = {
  id: number;
  title: string;
  episodeNumber: number;
  seasonNumber: number;
  mediaId: number;
  documentUri: string;
  fileName: string;
  sizeBytes: number | null;
  thumbnailPath: string | null;
  durationMs: number | null;
  positionMs: number | null;
  completed: number | null;
  versionCount: number;
  needsReview: number;
};

export type SeasonRow = {
  id: number;
  seasonNumber: number;
  title: string;
};

export type ContinueItem = {
  mediaId: number;
  entryId: number;
  kind: 'movie' | 'episode';
  displayTitle: string;
  subtitle: string | null;
  thumbnailPath: string | null;
  positionMs: number;
  durationMs: number | null;
  documentUri: string;
};

export type RecentItem = {
  id: number;
  kind: 'movie' | 'episode';
  displayTitle: string;
  subtitle: string | null;
  thumbnailPath: string | null;
  mediaId: number | null;
  seriesId: number | null;
};

export type SearchResult = {
  id: number;
  kind: 'movie' | 'series' | 'episode';
  title: string;
  subtitle: string | null;
  thumbnailPath: string | null;
  mediaId: number | null;
  seriesId: number | null;
};

export type ReviewItem = {
  id: number;
  kind: string;
  title: string;
  relativePath: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  classificationSource: string;
};

export type LibraryStats = {
  mediaCount: number;
  movieCount: number;
  seriesCount: number;
  episodeCount: number;
  totalBytes: number;
  missingCount: number;
};

export async function getRoot(): Promise<ScanRoot | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, never>>(
    'SELECT id, display_name AS displayName, document_uri AS documentUri, permission_persisted AS permissionPersisted, last_successful_scan_at AS lastSuccessfulScanAt, created_at AS createdAt, updated_at AS updatedAt FROM scan_root ORDER BY updated_at DESC LIMIT 1',
  );
  return (row as unknown as ScanRoot) ?? null;
}

export async function setRoot(uri: string, displayName: string): Promise<number> {
  const db = await getDb();
  const now = Date.now();
  const existing = await getRoot();
  if (existing && existing.documentUri === uri) {
    await db.runAsync('UPDATE scan_root SET updated_at = ?, permission_persisted = 1 WHERE id = ?', now, existing.id);
    return existing.id;
  }
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM playback_progress');
    await db.runAsync('DELETE FROM subtitle_track');
    await db.runAsync('DELETE FROM favorite');
    await db.runAsync('DELETE FROM episode_media');
    await db.runAsync('DELETE FROM library_entry');
    await db.runAsync('DELETE FROM media_item');
    await db.runAsync('DELETE FROM scan_state');
    await db.runAsync('DELETE FROM scan_root');
    await db.runAsync(
      'INSERT INTO scan_root (display_name, document_uri, permission_persisted, created_at, updated_at) VALUES (?, ?, 1, ?, ?)',
      displayName,
      uri,
      now,
      now,
    );
  });
  const row = await db.getFirstAsync<{ id: number }>('SELECT id FROM scan_root ORDER BY updated_at DESC LIMIT 1');
  return row!.id;
}

export async function entryForMedia(
  mediaId: number,
): Promise<{ id: number; kind: string; title: string; parentId: number | null; seasonNumber: number | null; episodeNumber: number | null; seriesId: number | null; seriesTitle: string | null } | null> {
  const db = await getDb();
  const movie = await db.getFirstAsync<{ id: number; title: string }>(
    "SELECT id, title FROM library_entry WHERE media_item_id = ? AND kind = 'movie'",
    mediaId,
  );
  if (movie) return { id: movie.id, kind: 'movie', title: movie.title, parentId: null, seasonNumber: null, episodeNumber: null, seriesId: null, seriesTitle: null };
  const ep = await db.getFirstAsync<{
    id: number; title: string; episode_number: number; season_number: number;
    series_id: number; series_title: string;
  }>(
    `SELECT e.id, e.title, e.episode_number, e.season_number, ser.id AS series_id, ser.title AS series_title
     FROM episode_media em
     JOIN library_entry e ON e.id = em.episode_entry_id
     JOIN library_entry se ON se.id = e.parent_id
     JOIN library_entry ser ON ser.id = se.parent_id
     WHERE em.media_item_id = ?
     LIMIT 1`,
    mediaId,
  );
  if (!ep) return null;
  return { id: ep.id, kind: 'episode', title: ep.title, parentId: null, seasonNumber: ep.season_number, episodeNumber: ep.episode_number, seriesId: ep.series_id, seriesTitle: ep.series_title };
}

export type HomeData = {
  movies: MovieSummary[];
  series: SeriesSummary[];
  continueWatching: ContinueItem[];
  recent: RecentItem[];
  favorites: SearchResult[];
};

export async function getHomeData(): Promise<HomeData> {
  const db = await getDb();
  const movies = await db.getAllAsync<MovieSummary>(
    `SELECT e.id, e.title, e.needs_review AS needsReview, m.id AS mediaItemId,
            m.thumbnail_path AS thumbnailPath, m.document_uri AS documentUri,
            m.duration_ms AS durationMs, m.size_bytes AS sizeBytes, m.file_name AS fileName
     FROM library_entry e JOIN media_item m ON m.id = e.media_item_id
     WHERE e.kind = 'movie' AND m.availability_status = 'available'
     ORDER BY e.sort_title LIMIT 80`,
  );
  const series = await db.getAllAsync<SeriesSummary>(
    `SELECT e.id, e.title, e.confidence, e.needs_review AS needsReview,
            (SELECT m.thumbnail_path FROM library_entry se
              JOIN library_entry ep ON ep.parent_id = se.id
              JOIN episode_media em ON em.episode_entry_id = ep.id AND em.is_primary = 1
              JOIN media_item m ON m.id = em.media_item_id
              WHERE se.parent_id = e.id AND m.availability_status = 'available' AND m.thumbnail_path IS NOT NULL
              LIMIT 1) AS thumbnailPath,
            (SELECT COUNT(*) FROM library_entry ep
              WHERE ep.parent_id IN (SELECT id FROM library_entry WHERE parent_id = e.id)) AS episodeCount
     FROM library_entry e
     WHERE e.kind = 'series' AND EXISTS (
       SELECT 1 FROM library_entry se
        JOIN library_entry ep ON ep.parent_id = se.id
        JOIN episode_media em ON em.episode_entry_id = ep.id
        JOIN media_item m ON m.id = em.media_item_id
       WHERE se.parent_id = e.id AND m.availability_status = 'available')
     ORDER BY e.sort_title LIMIT 80`,
  );
  const progressRows = await db.getAllAsync<{
    media_item_id: number; position_ms: number; duration_ms: number | null;
    file_name: string; thumbnail_path: string | null; document_uri: string;
  }>(
    `SELECT p.media_item_id, p.position_ms, p.duration_ms, m.file_name, m.thumbnail_path, m.document_uri
     FROM playback_progress p JOIN media_item m ON m.id = p.media_item_id
     WHERE p.completed = 0 AND p.position_ms > 15000 AND m.availability_status = 'available'
     ORDER BY p.last_played_at DESC LIMIT 12`,
  );
  const continueWatching: ContinueItem[] = [];
  for (const row of progressRows) {
    const entry = await entryForMedia(row.media_item_id);
    if (!entry) continue;
    continueWatching.push({
      mediaId: row.media_item_id,
      entryId: entry.id,
      kind: entry.kind === 'episode' ? 'episode' : 'movie',
      displayTitle: entry.kind === 'episode' && entry.seriesTitle ? entry.seriesTitle : entry.title,
      subtitle: entry.kind === 'episode' ? `S${entry.seasonNumber}E${entry.episodeNumber} · ${entry.title}` : null,
      thumbnailPath: row.thumbnail_path,
      positionMs: row.position_ms,
      durationMs: row.duration_ms,
      documentUri: row.document_uri,
    });
  }
  const recent = await db.getAllAsync<RecentItem>(
    `SELECT e.id, e.kind, e.title,
            CASE WHEN e.kind = 'episode' THEN ser.title ELSE e.title END AS displayTitle,
            CASE WHEN e.kind = 'episode' THEN 'S' || e.season_number || 'E' || e.episode_number ELSE NULL END AS subtitle,
            COALESCE(m.thumbnail_path, m2.thumbnail_path) AS thumbnailPath,
            COALESCE(m.id, m2.id) AS mediaId,
            CASE WHEN e.kind = 'episode' THEN ser.id ELSE e.id END AS seriesId
     FROM library_entry e
     LEFT JOIN library_entry se ON se.id = e.parent_id
     LEFT JOIN library_entry ser ON ser.id = se.parent_id
     LEFT JOIN media_item m ON m.id = e.media_item_id
     LEFT JOIN episode_media em ON em.episode_entry_id = e.id AND em.is_primary = 1
     LEFT JOIN media_item m2 ON m2.id = em.media_item_id
     WHERE e.kind IN ('movie', 'episode')
     ORDER BY e.created_at DESC LIMIT 20`,
  );
  const favorites = await db.getAllAsync<SearchResult>(
    `SELECT e.id, e.kind, e.title,
            CASE WHEN e.kind = 'episode' THEN ser.title ELSE NULL END AS subtitle,
            COALESCE(m.thumbnail_path, m2.thumbnail_path) AS thumbnailPath,
            COALESCE(m.id, m2.id) AS mediaId, NULL AS seriesId
     FROM favorite f
     JOIN library_entry e ON e.id = f.library_entry_id
     LEFT JOIN library_entry se ON se.id = e.parent_id
     LEFT JOIN library_entry ser ON ser.id = se.parent_id
     LEFT JOIN media_item m ON m.id = e.media_item_id
     LEFT JOIN episode_media em ON em.episode_entry_id = e.id AND em.is_primary = 1
     LEFT JOIN media_item m2 ON m2.id = em.media_item_id
     WHERE e.kind IN ('movie', 'series')
     ORDER BY f.created_at DESC LIMIT 30`,
  );
  return { movies, series, continueWatching, recent, favorites };
}

export async function getMovie(id: number): Promise<MovieDetail | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT e.id, e.title, e.confidence, e.needs_review AS needsReview,
            e.classification_source AS classificationSource,
            m.id AS mediaItemId, m.document_uri AS documentUri, m.relative_path AS relativePath,
            m.file_name AS fileName, m.size_bytes AS sizeBytes, m.duration_ms AS durationMs,
            m.thumbnail_path AS thumbnailPath,
            p.position_ms AS positionMs, p.completed AS completed,
            (SELECT COUNT(*) FROM favorite WHERE library_entry_id = e.id) AS isFavorite
     FROM library_entry e
     JOIN media_item m ON m.id = e.media_item_id
     LEFT JOIN playback_progress p ON p.media_item_id = m.id
     WHERE e.id = ?`,
    id,
  );
  return (row as unknown as MovieDetail) ?? null;
}

export async function getSeries(id: number): Promise<{ series: { id: number; title: string; thumbnailPath: string | null; isFavorite: number }; seasons: SeasonRow[]; episodes: EpisodeRow[] } | null> {
  const db = await getDb();
  const series = await db.getFirstAsync<{ id: number; title: string; thumbnailPath: string | null; isFavorite: number }>(
    `SELECT e.id, e.title,
            (SELECT m.thumbnail_path FROM library_entry se
              JOIN library_entry ep ON ep.parent_id = se.id
              JOIN episode_media em ON em.episode_entry_id = ep.id AND em.is_primary = 1
              JOIN media_item m ON m.id = em.media_item_id
              WHERE se.parent_id = e.id AND m.thumbnail_path IS NOT NULL LIMIT 1) AS thumbnailPath,
            (SELECT COUNT(*) FROM favorite WHERE library_entry_id = e.id) AS isFavorite
     FROM library_entry e WHERE e.id = ? AND e.kind = 'series'`,
    id,
  );
  if (!series) return null;
  const seasons = await db.getAllAsync<SeasonRow>(
    `SELECT id, season_number AS seasonNumber, title FROM library_entry
     WHERE parent_id = ? AND kind = 'season' ORDER BY season_number`,
    id,
  );
  const seasonIds = seasons.map((s) => s.id);
  let episodes: EpisodeRow[] = [];
  if (seasonIds.length > 0) {
    episodes = await db.getAllAsync<EpisodeRow>(
      `SELECT e.id, e.title, e.episode_number AS episodeNumber, e.season_number AS seasonNumber,
              e.needs_review AS needsReview,
              m.id AS mediaId, m.document_uri AS documentUri, m.file_name AS fileName,
              m.size_bytes AS sizeBytes, m.thumbnail_path AS thumbnailPath, m.duration_ms AS durationMs,
              p.position_ms AS positionMs, p.completed AS completed,
              (SELECT COUNT(*) FROM episode_media em2 WHERE em2.episode_entry_id = e.id) AS versionCount
       FROM library_entry e
       JOIN episode_media em ON em.episode_entry_id = e.id AND em.is_primary = 1
       JOIN media_item m ON m.id = em.media_item_id
       LEFT JOIN playback_progress p ON p.media_item_id = m.id
       WHERE e.parent_id IN (${seasonIds.map(() => '?').join(',')})
         AND m.availability_status = 'available'
       ORDER BY e.season_number, e.episode_number`,
      seasonIds,
    );
  }
  return { series, seasons, episodes };
}

export async function searchLibrary(query: string): Promise<SearchResult[]> {
  const db = await getDb();
  const q = `%${query.trim()}%`;
  if (!q.trim()) return [];
  return db.getAllAsync<SearchResult>(
    `SELECT e.id, e.kind, e.title, NULL AS subtitle, m.thumbnail_path AS thumbnailPath, m.id AS mediaId, NULL AS seriesId
     FROM library_entry e LEFT JOIN media_item m ON m.id = e.media_item_id
     WHERE e.kind IN ('movie', 'series') AND e.title LIKE ? COLLATE NOCASE
     UNION
     SELECT e.id, e.kind, e.title, ser.title AS subtitle, NULL AS thumbnailPath, NULL AS mediaId, ser.id AS seriesId
      FROM library_entry e
      JOIN library_entry se ON se.id = e.parent_id
      JOIN library_entry ser ON ser.id = se.parent_id
      WHERE e.kind = 'episode' AND e.title LIKE ? COLLATE NOCASE
     UNION
     SELECT DISTINCT e.id, e.kind, e.title, NULL AS subtitle, m2.thumbnail_path AS thumbnailPath, m2.id AS mediaId, NULL AS seriesId
      FROM library_entry e
      LEFT JOIN episode_media em ON em.episode_entry_id = e.id
      LEFT JOIN media_item m2 ON m2.id = em.media_item_id
      LEFT JOIN media_item m ON m.id = e.media_item_id
      WHERE m.file_name LIKE ? COLLATE NOCASE OR m2.file_name LIKE ? COLLATE NOCASE
     LIMIT 40`,
    q,
    q,
    q,
    q,
  );
}

export async function toggleFavorite(entryId: number): Promise<boolean> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ library_entry_id: number }>('SELECT library_entry_id FROM favorite WHERE library_entry_id = ?', entryId);
  if (existing) {
    await db.runAsync('DELETE FROM favorite WHERE library_entry_id = ?', entryId);
    return false;
  }
  await db.runAsync('INSERT INTO favorite (library_entry_id, created_at) VALUES (?, ?)', entryId, Date.now());
  return true;
}

export async function getProgress(mediaId: number): Promise<{ positionMs: number; durationMs: number | null; completed: number } | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ position_ms: number; duration_ms: number | null; completed: number }>(
    'SELECT position_ms, duration_ms, completed FROM playback_progress WHERE media_item_id = ?',
    mediaId,
  );
  return row ? { positionMs: row.position_ms, durationMs: row.duration_ms, completed: row.completed } : null;
}

export async function saveProgress(mediaId: number, positionMs: number, durationMs: number | null, completed?: boolean): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const done = completed ?? (durationMs != null && durationMs > 0 && positionMs / durationMs >= 0.95);
  await db.runAsync(
    `INSERT INTO playback_progress (media_item_id, position_ms, duration_ms, completed, last_played_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(media_item_id) DO UPDATE SET
       position_ms = excluded.position_ms,
       duration_ms = COALESCE(excluded.duration_ms, playback_progress.duration_ms),
       completed = excluded.completed,
       last_played_at = excluded.last_played_at,
       updated_at = excluded.updated_at`,
    mediaId,
    Math.round(positionMs),
    durationMs,
    done ? 1 : 0,
    now,
    now,
  );
}

export type MediaInfo = { id: number; documentUri: string; fileName: string; relativePath: string; sizeBytes: number | null; thumbnailPath: string | null; durationMs: number | null };

export async function getMedia(mediaId: number): Promise<MediaInfo | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT id, document_uri AS documentUri, file_name AS fileName, relative_path AS relativePath,
            size_bytes AS sizeBytes, thumbnail_path AS thumbnailPath, duration_ms AS durationMs
     FROM media_item WHERE id = ?`,
    mediaId,
  );
  return (row as unknown as MediaInfo) ?? null;
}

export async function updateMediaDuration(mediaId: number, durationMs: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE media_item SET duration_ms = ?, updated_at = ? WHERE id = ? AND (duration_ms IS NULL OR duration_ms != ?)', Math.round(durationMs), Date.now(), mediaId, Math.round(durationMs));
}

export async function setMediaThumbnail(mediaId: number, path: string | null): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE media_item SET thumbnail_path = ?, updated_at = ? WHERE id = ?', path, Date.now(), mediaId);
}

export async function clearThumbnailCache(): Promise<number> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: number; thumbnail_path: string }>('SELECT id, thumbnail_path FROM media_item WHERE thumbnail_path IS NOT NULL');
  const { File } = await import('expo-file-system');
  let cleared = 0;
  for (const row of rows) {
    try {
      const f = new File(row.thumbnail_path);
      if (f.exists) f.delete();
    } catch {
      // ignore missing cache files
    }
    cleared++;
  }
  await db.runAsync("UPDATE media_item SET thumbnail_path = NULL, updated_at = ? WHERE thumbnail_path IS NOT NULL", Date.now());
  return cleared;
}

export async function listReviewItems(): Promise<ReviewItem[]> {
  const db = await getDb();
  return db.getAllAsync<ReviewItem>(
    `SELECT id, kind, title, relative_path AS relativePath, season_number AS seasonNumber,
            episode_number AS episodeNumber, classification_source AS classificationSource
     FROM library_entry
     WHERE needs_review = 1 AND kind IN ('movie', 'series', 'episode')
     ORDER BY kind, title LIMIT 100`,
  );
}

export async function saveOverride(input: { entryId: number; title?: string; seasonNumber?: number; episodeNumber?: number; exclude?: boolean }): Promise<void> {
  const db = await getDb();
  const entry = await db.getFirstAsync<{ relative_path: string | null; title: string }>(
    'SELECT relative_path, title FROM library_entry WHERE id = ?',
    input.entryId,
  );
  if (!entry?.relative_path) return;
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO classification_override (target_relative_path, override_kind, override_title, season_number, episode_number, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(target_relative_path) DO UPDATE SET
         override_kind = COALESCE(excluded.override_kind, classification_override.override_kind),
         override_title = COALESCE(excluded.override_title, classification_override.override_title),
         season_number = COALESCE(excluded.season_number, classification_override.season_number),
         episode_number = COALESCE(excluded.episode_number, classification_override.episode_number),
         updated_at = excluded.updated_at`,
      entry.relative_path,
      input.exclude ? 'exclude' : null,
      input.title ?? null,
      input.seasonNumber ?? null,
      input.episodeNumber ?? null,
      now,
      now,
    );
    if (input.exclude) {
      await db.runAsync('DELETE FROM favorite WHERE library_entry_id = ?', input.entryId);
      await db.runAsync('DELETE FROM episode_media WHERE episode_entry_id = ?', input.entryId);
      await db.runAsync('DELETE FROM library_entry WHERE id = ?', input.entryId);
    } else {
      await db.runAsync(
        `UPDATE library_entry SET
           title = COALESCE(?, title),
           sort_title = COALESCE(?, sort_title),
           season_number = COALESCE(?, season_number),
           episode_number = COALESCE(?, episode_number),
           needs_review = 0,
           classification_source = 'manual',
           confidence = 1.0,
           updated_at = ?
         WHERE id = ?`,
        input.title ?? null,
        input.title ? sortTitleOf(input.title) : null,
        input.seasonNumber ?? null,
        input.episodeNumber ?? null,
        now,
        input.entryId,
      );
    }
  });
}

export async function findNextEpisode(seriesId: number, seasonNumber: number, episodeNumber: number): Promise<{ mediaId: number; episodeId: number; title: string; seasonNumber: number; episodeNumber: number } | null> {
  const db = await getDb();
  const seasons = await db.getAllAsync<{ id: number; seasonNumber: number }>(
    "SELECT id, season_number AS seasonNumber FROM library_entry WHERE parent_id = ? AND kind = 'season' ORDER BY season_number",
    seriesId,
  );
  for (let i = 0; i < seasons.length; i++) {
    const eps = await db.getAllAsync<{ id: number; title: string; episodeNumber: number; mediaId: number; documentUri: string }>(
      `SELECT e.id, e.title, e.episode_number AS episodeNumber, m.id AS mediaId, m.document_uri AS documentUri
       FROM library_entry e
       JOIN episode_media em ON em.episode_entry_id = e.id AND em.is_primary = 1
       JOIN media_item m ON m.id = em.media_item_id
       WHERE e.parent_id = ? AND m.availability_status = 'available'
       ORDER BY e.episode_number`,
      seasons[i].id,
    );
    const found = eps.find(
      (e) =>
        seasons[i].seasonNumber > seasonNumber ||
        (seasons[i].seasonNumber === seasonNumber && e.episodeNumber > episodeNumber),
    );
    if (found) {
      return { mediaId: found.mediaId, episodeId: found.id, title: found.title, seasonNumber: seasons[i].seasonNumber, episodeNumber: found.episodeNumber };
    }
  }
  return null;
}

export async function getStats(): Promise<LibraryStats> {
  const db = await getDb();
  const media = await db.getFirstAsync<{ mediaCount: number; totalBytes: number | null; missingCount: number }>(
    `SELECT COUNT(*) AS mediaCount, SUM(size_bytes) AS totalBytes,
            SUM(CASE WHEN availability_status = 'missing' THEN 1 ELSE 0 END) AS missingCount
     FROM media_item`,
  );
  const entries = await db.getFirstAsync<{ movieCount: number; seriesCount: number; episodeCount: number }>(
    `SELECT
       SUM(CASE WHEN kind = 'movie' THEN 1 ELSE 0 END) AS movieCount,
       SUM(CASE WHEN kind = 'series' THEN 1 ELSE 0 END) AS seriesCount,
       SUM(CASE WHEN kind = 'episode' THEN 1 ELSE 0 END) AS episodeCount
     FROM library_entry`,
  );
  return {
    mediaCount: media?.mediaCount ?? 0,
    movieCount: entries?.movieCount ?? 0,
    seriesCount: entries?.seriesCount ?? 0,
    episodeCount: entries?.episodeCount ?? 0,
    totalBytes: media?.totalBytes ?? 0,
    missingCount: media?.missingCount ?? 0,
  };
}

export async function getAllOverrides(db: SQLiteDatabase): Promise<Map<string, { overrideKind: string | null; overrideTitle: string | null; seasonNumber: number | null; episodeNumber: number | null }>> {
  const rows = await db.getAllAsync<{ target_relative_path: string; override_kind: string | null; override_title: string | null; season_number: number | null; episode_number: number | null }>(
    'SELECT target_relative_path, override_kind, override_title, season_number, episode_number FROM classification_override',
  );
  return new Map(rows.map((r) => [r.target_relative_path, { overrideKind: r.override_kind, overrideTitle: r.override_title, seasonNumber: r.season_number, episodeNumber: r.episode_number }]));
}
