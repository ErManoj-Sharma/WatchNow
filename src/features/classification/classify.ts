import {
  EpisodePattern,
  isPassThroughDir,
  isVideoFile,
  naturalCompare,
  parseEpisodePattern,
  parseSeasonFromDir,
  splitPath,
  stripExtension,
  stripTechnicalTokens,
} from './parse';
import type {
  ClassifiedLibrary,
  EpisodeGroup,
  MovieGroup,
  ScannedFile,
  SeriesGroup,
} from './types';

type Prepared = {
  file: ScannedFile;
  dirs: string[];
  pattern: EpisodePattern | null;
  seasonFromDirs: number | null;
  seriesPath: string;
  seriesTitleFromPath: string | null;
};

function seriesPathFor(dirs: string[]): { seriesPath: string; seasons: number[] } {
  const seasons: number[] = [];
  let i = dirs.length - 1;
  while (i >= 0) {
    const season = parseSeasonFromDir(dirs[i]);
    if (season !== null) {
      seasons.push(season);
      i--;
      continue;
    }
    if (isPassThroughDir(dirs[i])) {
      i--;
      continue;
    }
    break;
  }
  const seriesPath = dirs.slice(0, i + 1).join('/');
  return { seriesPath, seasons };
}

function cleanDirName(dir: string): string {
  return stripTechnicalTokens(dir).replace(/\s{2,}/g, ' ').trim() || dir;
}

function episodeTitle(fileName: string, seriesTitle: string, episodeNumber: number, pattern: EpisodePattern | null): string {
  let base = stripExtension(fileName);
  if (pattern) base = base.replace(pattern.matched, ' ');
  const cleaned = stripTechnicalTokens(base).trim();
  if (!cleaned || cleaned.toLowerCase() === seriesTitle.toLowerCase()) return `Episode ${episodeNumber}`;
  return cleaned;
}

function prepare(files: ScannedFile[]): Prepared[] {
  const out: Prepared[] = [];
  for (const file of files) {
    if (!isVideoFile(file.fileName)) continue;
    const { dirs, fileName } = splitPath(file.relativePath);
    if (/^sample\b/i.test(stripExtension(fileName))) continue;
    const pattern = parseEpisodePattern(fileName);
    const { seriesPath, seasons } = seriesPathFor(dirs);
    out.push({
      file,
      dirs,
      pattern,
      seasonFromDirs: seasons.length ? seasons[0] : null,
      seriesPath,
      seriesTitleFromPath: seriesPath ? cleanDirName(seriesPath.split('/').pop() ?? seriesPath) : null,
    });
  }
  return out;
}

function seriesTitleFromEpisodes(items: Prepared[], path: string): string {
  const fromPath = items.find((i) => i.seriesTitleFromPath)?.seriesTitleFromPath;
  if (fromPath) return fromPath;
  const titles = items.map((i) => {
    let base = stripExtension(i.file.fileName);
    if (i.pattern) base = base.replace(i.pattern.matched, ' ');
    return stripTechnicalTokens(base).trim();
  }).filter(Boolean);
  if (titles.length === 0) return 'Untitled Series';
  const first = titles[0];
  if (titles.every((t) => t.toLowerCase() === first.toLowerCase())) return first;
  let prefix = first;
  for (const t of titles) {
    while (prefix && !t.toLowerCase().startsWith(prefix.toLowerCase())) prefix = prefix.slice(0, -1);
  }
  return prefix.trim() || (path ? cleanDirName(path.split('/').pop() ?? path) : 'Untitled Series');
}

function sortKey(p: Prepared): string {
  return p.file.relativePath;
}

export function classifyLibrary(files: ScannedFile[]): ClassifiedLibrary {
  const prepared = prepare(files);

  const episodeish = prepared.filter((p) => p.pattern !== null);
  const rest = prepared.filter((p) => p.pattern === null);

  // Group explicit-episode files by series path.
  const seriesEpisodes = new Map<string, Prepared[]>();
  for (const p of episodeish) {
    const list = seriesEpisodes.get(p.seriesPath) ?? [];
    list.push(p);
    seriesEpisodes.set(p.seriesPath, list);
  }

  const series: SeriesGroup[] = [];
  const used = new Set<Prepared>();
  const seriesPaths = new Set(seriesEpisodes.keys());

  for (const [path, items] of seriesEpisodes) {
    items.sort((a, b) => naturalCompare(sortKey(a), sortKey(b)));
    items.forEach((i) => used.add(i));
    const title = seriesTitleFromEpisodes(items, path);
    const strong = items.filter((i) => (i.pattern?.confidence ?? 0) >= 0.9).length;
    const explicit = items.length > 0 && strong > 0;
    const onlyWeak = !explicit && items.every((i) => (i.pattern?.confidence ?? 0) >= 0.75);
    let confidence: number;
    const evidence: string[] = [];
    if (explicit) {
      confidence = items.length > 1 ? 0.95 : 0.9;
      evidence.push('explicit season/episode pattern in filename');
    } else if (onlyWeak) {
      confidence = items.length > 1 ? 0.8 : 0.6;
      evidence.push('episode wording in filenames');
      if (items.length <= 1) evidence.push('single episode file, siblings missing');
    } else {
      confidence = 0.7;
      evidence.push('mixed episode evidence');
    }
    series.push({
      path,
      title,
      confidence,
      needsReview: confidence < 0.7,
      evidence,
      episodes: buildEpisodes(items, title),
    });
  }

  // Adopt non-episode files that live inside a recognized series directory.
  const adopted: { p: Prepared; seriesPath: string }[] = [];
  for (const p of rest) {
    let match: string | null = null;
    for (const sp of seriesPaths) {
      if (sp === '') continue;
      if (p.dirs.join('/') === sp) {
        match = sp;
        break;
      }
      if (p.dirs.join('/').startsWith(sp + '/')) {
        const remainder = p.dirs.slice(sp.split('/').length);
        if (remainder.length > 0 && remainder.every((d) => isPassThroughDir(d))) {
          match = sp;
          break;
        }
      }
    }
    if (match) {
      adopted.push({ p, seriesPath: match });
      used.add(p);
    }
  }
  for (const group of series) {
    const extra = adopted.filter((a) => a.seriesPath === group.path);
    if (extra.length === 0) continue;
    const additions = buildEpisodes(
      extra.map((a) => a.p).sort((a, b) => naturalCompare(sortKey(a), sortKey(b))),
      group.title,
      true,
    );
    for (const ep of additions) {
      const existing = group.episodes.find((e) => e.seasonNumber === ep.seasonNumber && e.episodeNumber === ep.episodeNumber);
      if (existing) {
        existing.files.push(...ep.files);
        existing.needsReview = true;
        existing.confidence = Math.min(existing.confidence, 0.5);
        existing.evidence.push('sibling file adopted into series');
      } else {
        group.episodes.push(ep);
      }
    }
    if (extra.length > 0) {
      group.evidence.push(`${extra.length} sibling video(s) adopted`);
      if (group.episodes.some((e) => e.needsReview)) group.needsReview = true;
    }
    group.episodes.sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);
  }

  // Remaining videos: group by containing directory.
  const leftovers = rest.filter((p) => !used.has(p));
  const byDir = new Map<string, Prepared[]>();
  for (const p of leftovers) {
    const dir = p.dirs.join('/');
    const list = byDir.get(dir) ?? [];
    list.push(p);
    byDir.set(dir, list);
  }

  const movies: MovieGroup[] = [];
  for (const [dir, items] of byDir) {
    items.sort((a, b) => naturalCompare(sortKey(a), sortKey(b)));

    if (items.length >= 2 && dir !== '') {
      const { seriesPath } = seriesPathFor(dir ? dir.split('/') : []);
      const season = dir ? parseSeasonFromDir(dir.split('/').pop() ?? '') : null;
      const existing = series.find((s) => s.path === seriesPath && seriesPath !== '');
      const hasSeasonDir = season !== null;
      const confidence = hasSeasonDir ? 0.75 : 0.45;
      const evidence = hasSeasonDir
        ? ['season directory with multiple videos']
        : ['multiple videos in one folder'];
      const newSeries: SeriesGroup = {
        path: seriesPath || dir,
        title: cleanDirName((seriesPath || dir).split('/').pop() ?? dir),
        confidence,
        needsReview: confidence < 0.7,
        evidence,
        episodes: [],
      };
      if (existing) {
        existing.episodes.push(...buildEpisodes(items, existing.title, true, season));
        existing.needsReview = existing.needsReview || newSeries.needsReview;
        existing.evidence.push(...evidence);
        existing.episodes.sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);
      } else {
        newSeries.episodes = buildEpisodes(items, newSeries.title, false, season);
        series.push(newSeries);
        seriesPaths.add(newSeries.path);
      }
      continue;
    }

    for (const p of items) {
      const rawTitle = stripTechnicalTokens(p.file.fileName);
      const title = rawTitle || cleanDirName(p.dirs[p.dirs.length - 1] ?? 'Untitled');
      const confidence = rawTitle ? 0.85 : 0.6;
      movies.push({
        title,
        confidence,
        needsReview: confidence < 0.7,
        evidence: ['single video file without episode markers'],
        file: p.file,
      });
    }
  }

  return { movies, series };
}

function buildEpisodes(
  items: Prepared[],
  seriesTitle: string,
  adopted = false,
  seasonOverride?: number | null,
): EpisodeGroup[] {
  const buckets = new Map<string, { season: number; items: Prepared[] }>();
  for (const p of items) {
    const season = p.pattern?.season ?? seasonOverride ?? p.seasonFromDirs ?? 1;
    const key = String(season);
    const bucket = buckets.get(key) ?? { season, items: [] };
    bucket.items.push(p);
    buckets.set(key, bucket);
  }

  const episodes: EpisodeGroup[] = [];
  for (const { season, items: bucketItems } of buckets.values()) {
    bucketItems.sort((a, b) => naturalCompare(sortKey(a), sortKey(b)));
    const seen = new Map<number, Prepared[]>();
    for (const p of bucketItems) {
      let epNum = p.pattern?.episode ?? null;
      if (epNum === null) {
        let n = 1;
        while (seen.has(n)) n++;
        epNum = n;
      }
      const list = seen.get(epNum) ?? [];
      list.push(p);
      seen.set(epNum, list);
    }
    for (const [episodeNumber, groupItems] of seen) {
      const explicitItem = groupItems.find((g) => g.pattern);
      const pattern = explicitItem?.pattern ?? null;
      const guessed = !adopted && !pattern;
      const confidence = pattern ? pattern.confidence : guessed ? 0.5 : 0.45;
      const evidence: string[] = [];
      if (pattern) evidence.push(`filename pattern "${pattern.matched.trim()}"`);
      if (groupItems.some((g) => g.seasonFromDirs !== null)) evidence.push('season directory name');
      if (!pattern) evidence.push('episode number guessed from folder order');
      if (adopted) evidence.push('adopted from sibling file');
      if (groupItems.length > 1) evidence.push(`${groupItems.length} quality versions`);
      episodes.push({
        seriesPath: explicitItem?.seriesPath ?? groupItems[0].seriesPath,
        seriesTitle,
        seasonNumber: season,
        episodeNumber,
        title: episodeTitle(groupItems[0].file.fileName, seriesTitle, episodeNumber, pattern),
        confidence,
        needsReview: confidence < 0.7,
        evidence,
        files: groupItems.map((g) => g.file),
      });
    }
  }
  episodes.sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);
  return episodes;
}
