import { Directory, File } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDb } from '@/db/database';
import { deleteEntryDeep, getAllOverrides } from '@/db/repositories';
import { classifyLibrary } from '@/features/classification/classify';
import {
  isSubtitleFile,
  isVideoFile,
  qualityOf,
  sortTitleOf,
  stripExtension,
} from '@/features/classification/parse';
import type { ScannedFile } from '@/features/classification/types';

const MAX_DEPTH = 12;
const YIELD_EVERY = 25;
const SKIP_DIRS = new Set([
  '.thumbnails',
  'thumbs',
  'cache',
  '.cache',
  '$recycle.bin',
  'lost+found',
  '#recycle',
  'android',
]);

export type ScanProgress = {
  status: 'idle' | 'scanning' | 'indexing' | 'done' | 'error' | 'cancelled';
  directoriesVisited: number;
  filesDiscovered: number;
  filesIndexed: number;
  errorCount: number;
  currentPath: string;
  errors: string[];
};

export const IDLE_PROGRESS: ScanProgress = {
  status: 'idle',
  directoriesVisited: 0,
  filesDiscovered: 0,
  filesIndexed: 0,
  errorCount: 0,
  currentPath: '',
  errors: [],
};

type VideoEntry = ScannedFile & { mime: string | null };

type TraverseResult = {
  videos: VideoEntry[];
  subtitles: ScannedFile[];
  directoriesVisited: number;
  errors: string[];
  cancelled: boolean;
};

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function traverse(
  rootUri: string,
  onStep: (progress: { directoriesVisited: number; filesDiscovered: number; currentPath: string }) => void,
  shouldCancel: () => boolean,
): Promise<TraverseResult> {
  const videos: VideoEntry[] = [];
  const subtitles: ScannedFile[] = [];
  const errors: string[] = [];
  const visited = new Set<string>();
  let directoriesVisited = 0;

  const stack: { dir: Directory; rel: string; depth: number }[] = [
    { dir: new Directory(rootUri), rel: '', depth: 0 },
  ];

  while (stack.length > 0) {
    if (shouldCancel()) return { videos, subtitles, directoriesVisited, errors, cancelled: true };
    const { dir, rel, depth } = stack.pop()!;
    if (depth > MAX_DEPTH || visited.has(dir.uri)) continue;
    visited.add(dir.uri);
    directoriesVisited++;

    let entries: (Directory | File)[] = [];
    try {
      entries = dir.list();
    } catch {
      errors.push(rel || '/');
      if (errors.length > 20) errors.length = 20;
      continue;
    }

    for (const entry of entries) {
      const name = entry.name.replace(/\/+$/, '');
      if (!name || name.startsWith('.')) continue;
      const childRel = rel ? `${rel}/${name}` : name;
      if (entry instanceof Directory) {
        if (SKIP_DIRS.has(name.toLowerCase())) continue;
        stack.push({ dir: entry, rel: childRel, depth: depth + 1 });
      } else if (isVideoFile(name)) {
        videos.push({
          relativePath: childRel,
          fileName: name,
          sizeBytes: entry.size ?? null,
          uri: entry.uri,
          modifiedAt: entry.lastModified || null,
          mime: entry.type || null,
        });
      } else if (isSubtitleFile(name)) {
        subtitles.push({
          relativePath: childRel,
          fileName: name,
          sizeBytes: entry.size ?? null,
          uri: entry.uri,
          modifiedAt: entry.lastModified || null,
        });
      }
    }

    if (directoriesVisited % YIELD_EVERY === 0) {
      onStep({ directoriesVisited, filesDiscovered: videos.length, currentPath: rel || '/' });
      await yieldToUi();
    }
  }

  return { videos, subtitles, directoriesVisited, errors, cancelled: false };
}

function versionRank(f: ScannedFile): number {
  const q = qualityOf(f.fileName) ?? '';
  let score = 0;
  if (/2160|4K/i.test(q)) score = 4;
  else if (/1080/i.test(q)) score = 3;
  else if (/720/i.test(q)) score = 2;
  else if (/480|576/i.test(q)) score = 1;
  return score * 1e14 + (f.sizeBytes ?? 0);
}

export async function scanActiveRoot(
  onProgress: (progress: ScanProgress) => void,
  shouldCancel: () => boolean,
): Promise<void> {
  const db = await getDb();
  const root = await db.getFirstAsync<{ id: number; document_uri: string }>(
    'SELECT id, document_uri FROM scan_root ORDER BY updated_at DESC LIMIT 1',
  );
  if (!root) return;

  const startedAt = Date.now();
  const stateRow = await db.runAsync(
    "INSERT INTO scan_state (root_id, status, started_at) VALUES (?, 'scanning', ?)",
    root.id,
    startedAt,
  );
  const scanId = stateRow.lastInsertRowId;

  let progress: ScanProgress = { ...IDLE_PROGRESS, status: 'scanning' };
  const emit = (patch: Partial<ScanProgress>) => {
    progress = { ...progress, ...patch };
    onProgress(progress);
  };

  try {
    emit({ status: 'scanning' });
    const result = await traverse(
      root.document_uri,
      (step) => emit(step),
      shouldCancel,
    );

    if (result.cancelled) {
      await db.runAsync(
        "UPDATE scan_state SET status = 'cancelled', completed_at = ?, directories_visited = ?, files_discovered = ?, cancelled = 1 WHERE id = ?",
        Date.now(),
        result.directoriesVisited,
        result.videos.length,
        scanId,
      );
      emit({ status: 'cancelled', directoriesVisited: result.directoriesVisited, filesDiscovered: result.videos.length, errors: result.errors, errorCount: result.errors.length });
      return;
    }

    emit({ status: 'indexing', directoriesVisited: result.directoriesVisited, filesDiscovered: result.videos.length, errorCount: result.errors.length, errors: result.errors });
    const indexed = await reconcile(db, root.id, result, emit, shouldCancel);
    const now = Date.now();
    await db.runAsync(
      "UPDATE scan_state SET status = 'done', completed_at = ?, directories_visited = ?, files_discovered = ?, files_indexed = ?, error_count = ? WHERE id = ?",
      now,
      result.directoriesVisited,
      result.videos.length,
      indexed,
      result.errors.length,
      scanId,
    );
    await db.runAsync('UPDATE scan_root SET last_successful_scan_at = ?, updated_at = ? WHERE id = ?', now, now, root.id);
    emit({
      status: 'done',
      directoriesVisited: result.directoriesVisited,
      filesDiscovered: result.videos.length,
      filesIndexed: indexed,
      errorCount: result.errors.length,
      errors: result.errors,
      currentPath: '',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.runAsync(
      "UPDATE scan_state SET status = 'error', completed_at = ?, error_count = error_count + 1 WHERE id = ?",
      Date.now(),
      scanId,
    ).catch(() => undefined);
    emit({ status: 'error', errors: [...progress.errors, message].slice(0, 20), errorCount: progress.errorCount + 1 });
  }
}

async function reconcile(
  db: SQLiteDatabase,
  rootId: number,
  result: TraverseResult,
  emit: (patch: Partial<ScanProgress>) => void,
  shouldCancel: () => boolean,
): Promise<number> {
  const now = Date.now();
  const overrides = await getAllOverrides(db);
  const excludedPaths = new Set(
    [...overrides.entries()].filter(([, o]) => o.overrideKind === 'exclude').map(([p]) => p),
  );
  const videos = result.videos.filter((v) => !excludedPaths.has(v.relativePath));

  const existing = await db.getAllAsync<{
    id: number; relative_path: string; document_uri: string; file_name: string;
    size_bytes: number | null; modified_at: number | null; availability_status: string;
  }>('SELECT id, relative_path, document_uri, file_name, size_bytes, modified_at, availability_status FROM media_item WHERE root_id = ?', rootId);

  const byPath = new Map(existing.map((r) => [r.relative_path, r]));
  const byNameSize = new Map<string, (typeof existing)[number]>();
  for (const row of existing) {
    const key = `${row.file_name}|${row.size_bytes ?? -1}`;
    if (!byNameSize.has(key)) byNameSize.set(key, row);
  }

  const mediaIdByPath = new Map<string, number>();
  const seenIds = new Set<number>();
  let filesIndexed = 0;

  await db.withTransactionAsync(async () => {
    for (const f of videos) {
      if (shouldCancel()) break;
      let row = byPath.get(f.relativePath);
      if (!row) {
        const moved = byNameSize.get(`${f.fileName}|${f.sizeBytes ?? -1}`);
        if (moved && moved.availability_status === 'missing') {
          await db.runAsync(
            "UPDATE media_item SET relative_path = ?, document_uri = ?, modified_at = ?, availability_status = 'available', last_scanned_at = ?, updated_at = ? WHERE id = ?",
            f.relativePath, f.uri, f.modifiedAt, now, now, moved.id,
          );
          row = { ...moved, relative_path: f.relativePath, document_uri: f.uri, modified_at: f.modifiedAt, availability_status: 'available' };
        }
      }
      if (!row) {
        const res = await db.runAsync(
          `INSERT INTO media_item (root_id, document_uri, relative_path, file_name, size_bytes, modified_at, mime_type, availability_status, last_scanned_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?)`,
          rootId, f.uri, f.relativePath, f.fileName, f.sizeBytes, f.modifiedAt, f.mime, now, now, now,
        );
        row = { id: res.lastInsertRowId, relative_path: f.relativePath, document_uri: f.uri, file_name: f.fileName, size_bytes: f.sizeBytes, modified_at: f.modifiedAt, availability_status: 'available' };
      } else {
        const changed = row.document_uri !== f.uri || row.size_bytes !== f.sizeBytes || row.modified_at !== f.modifiedAt;
        if (changed) {
          await db.runAsync(
            "UPDATE media_item SET document_uri = ?, size_bytes = ?, modified_at = ?, availability_status = 'available', last_scanned_at = ?, updated_at = ? WHERE id = ?",
            f.uri, f.sizeBytes, f.modifiedAt, now, now, row.id,
          );
        } else {
          await db.runAsync("UPDATE media_item SET availability_status = 'available', last_scanned_at = ? WHERE id = ?", now, row.id);
        }
      }
      mediaIdByPath.set(f.relativePath, row.id);
      seenIds.add(row.id);
      filesIndexed++;
      if (filesIndexed % 100 === 0) emit({ filesIndexed });
    }

    if (!shouldCancel()) {
      for (const row of existing) {
        if (!seenIds.has(row.id)) {
          await db.runAsync("UPDATE media_item SET availability_status = 'missing', updated_at = ? WHERE id = ?", now, row.id);
        }
      }
    }

    const lib = classifyLibrary(videos);
    const seenEntryIds = new Set<number>();

    for (const movie of lib.movies) {
      if (excludedPaths.has(movie.file.relativePath)) continue;
      const mediaId = mediaIdByPath.get(movie.file.relativePath);
      if (mediaId == null) continue;
      const ov = overrides.get(movie.file.relativePath);
      if (ov?.overrideKind && ov.overrideKind !== 'movie') continue;
      const title = ov?.overrideTitle || movie.title;
      const id = await upsertEntry(db, {
        dedupeKey: `movie:${movie.file.relativePath}`,
        title,
        kind: 'movie',
        parentId: null,
        mediaItemId: mediaId,
        seasonNumber: null,
        episodeNumber: null,
        classificationSource: ov ? 'manual' : 'pattern',
        confidence: ov ? 1 : movie.confidence,
        needsReview: ov ? 0 : movie.needsReview ? 1 : 0,
        relativePath: movie.file.relativePath,
        now,
      });
      seenEntryIds.add(id);
    }

    for (const show of lib.series) {
      const seriesPaths = new Set(show.episodes.flatMap((e) => e.files.map((f) => f.relativePath)));
      if ([...seriesPaths].every((p) => excludedPaths.has(p))) continue;
      const ovSeries = show.path ? overrides.get(show.path) : undefined;
      const title = ovSeries?.overrideTitle || show.title;
      const seriesKey = show.path ? `series:${show.path}` : `series:<root>:${title}`;
      const seriesId = await upsertEntry(db, {
        dedupeKey: seriesKey,
        title,
        kind: 'series',
        parentId: null,
        mediaItemId: null,
        seasonNumber: null,
        episodeNumber: null,
        classificationSource: ovSeries ? 'manual' : 'pattern',
        confidence: ovSeries ? 1 : show.confidence,
        needsReview: ovSeries ? 0 : show.needsReview ? 1 : 0,
        relativePath: show.path || null,
        now,
      });
      seenEntryIds.add(seriesId);

      const seasonNumbers = [...new Set(show.episodes.map((e) => e.seasonNumber))].sort((a, b) => a - b);
      const seasonIds = new Map<number, number>();
      for (const n of seasonNumbers) {
        const id = await upsertEntry(db, {
          dedupeKey: `${seriesKey}:season:${n}`,
          title: `Season ${n}`,
          kind: 'season',
          parentId: seriesId,
          mediaItemId: null,
          seasonNumber: n,
          episodeNumber: null,
          classificationSource: 'pattern',
          confidence: 1,
          needsReview: 0,
          relativePath: null,
          now,
        });
        seenEntryIds.add(id);
        seasonIds.set(n, id);
      }

      for (const ep of show.episodes) {
        const playable = ep.files.filter((f) => !excludedPaths.has(f.relativePath));
        if (playable.length === 0) continue;
        const ovEp = playable.map((f) => overrides.get(f.relativePath)).find(Boolean);
        if (ovEp?.overrideKind === 'exclude') continue;
        const epTitle = ovEp?.overrideTitle || ep.title;
        const seasonParent = seasonIds.get(ep.seasonNumber);
        if (seasonParent == null) continue;
        const id = await upsertEntry(db, {
          dedupeKey: `${seriesKey}:season:${ep.seasonNumber}:episode:${ep.episodeNumber}`,
          title: epTitle,
          kind: 'episode',
          parentId: seasonParent,
          mediaItemId: null,
          seasonNumber: ovEp?.seasonNumber ?? ep.seasonNumber,
          episodeNumber: ovEp?.episodeNumber ?? ep.episodeNumber,
          classificationSource: ovEp ? 'manual' : 'pattern',
          confidence: ovEp ? 1 : ep.confidence,
          needsReview: ovEp ? 0 : ep.needsReview ? 1 : 0,
          relativePath: playable[0].relativePath,
          now,
        });
        seenEntryIds.add(id);
        await db.runAsync('DELETE FROM episode_media WHERE episode_entry_id = ?', id);
        const ordered = [...playable].sort((a, b) => versionRank(b) - versionRank(a));
        for (let i = 0; i < ordered.length; i++) {
          const mid = mediaIdByPath.get(ordered[i].relativePath);
          if (mid != null) {
            await db.runAsync(
              'INSERT OR IGNORE INTO episode_media (episode_entry_id, media_item_id, is_primary) VALUES (?, ?, ?)',
              id, mid, i === 0 ? 1 : 0,
            );
          }
        }
      }
    }

    if (!shouldCancel() && seenEntryIds.size > 0) {
      const stale = await db.getAllAsync<{ id: number }>(
        `SELECT id FROM library_entry WHERE id NOT IN (${[...seenEntryIds].map(() => '?').join(',')})`,
        [...seenEntryIds],
      );
      for (const s of stale) {
        await deleteEntryDeep(db, s.id);
      }
    }
  });

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM subtitle_track');
    const mediaByKey = new Map<string, number>();
    for (const f of videos) {
      const slash = f.relativePath.lastIndexOf('/');
      const dir = slash >= 0 ? f.relativePath.slice(0, slash) : '';
      const key = `${dir}/${stripExtension(f.fileName)}`.toLowerCase();
      mediaByKey.set(key, mediaIdByPath.get(f.relativePath) ?? -1);
    }
    for (const s of result.subtitles) {
      const slash = s.relativePath.lastIndexOf('/');
      const dir = slash >= 0 ? s.relativePath.slice(0, slash) : '';
      const key = `${dir}/${stripExtension(s.fileName)}`.toLowerCase();
      const mediaId = mediaByKey.get(key);
      if (mediaId == null || mediaId < 0) continue;
      await db.runAsync(
        'INSERT INTO subtitle_track (media_item_id, document_uri, display_name, is_external) VALUES (?, ?, ?, 1)',
        mediaId, s.uri, s.fileName,
      );
    }
  });

  return filesIndexed;
}

async function upsertEntry(
  db: SQLiteDatabase,
  e: {
    dedupeKey: string; title: string; kind: string; parentId: number | null;
    mediaItemId: number | null; seasonNumber: number | null; episodeNumber: number | null;
    classificationSource: string; confidence: number; needsReview: number;
    relativePath: string | null; now: number;
  },
): Promise<number> {
  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM library_entry WHERE dedupe_key = ?', e.dedupeKey);
  const sortTitle = sortTitleOf(e.title);
  if (existing) {
    await db.runAsync(
      `UPDATE library_entry SET title = ?, sort_title = ?, kind = ?, parent_id = ?, media_item_id = ?,
        season_number = ?, episode_number = ?, classification_source = ?, confidence = ?, needs_review = ?,
        relative_path = ?, updated_at = ? WHERE id = ?`,
      e.title, sortTitle, e.kind, e.parentId, e.mediaItemId, e.seasonNumber, e.episodeNumber,
      e.classificationSource, e.confidence, e.needsReview, e.relativePath, e.now, existing.id,
    );
    return existing.id;
  }
  const res = await db.runAsync(
    `INSERT INTO library_entry (dedupe_key, title, sort_title, kind, parent_id, media_item_id,
      season_number, episode_number, classification_source, confidence, needs_review, relative_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    e.dedupeKey, e.title, sortTitle, e.kind, e.parentId, e.mediaItemId, e.seasonNumber, e.episodeNumber,
    e.classificationSource, e.confidence, e.needsReview, e.relativePath, e.now, e.now,
  );
  return res.lastInsertRowId;
}
