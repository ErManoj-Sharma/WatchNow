import {
  getSetting,
  listPendingPosters,
  markEntryAttempted,
  markMediaAttempted,
  setEntryPoster,
  setMediaPoster,
  type PendingPoster,
} from '@/db/repositories';

import { extractYear, queryTitleOf } from './match';
import { omdbPoster, omdbPosterById, tvmazePoster, tmdbPoster, type FetchDeps, type PosterHit } from './providers';

const THROTTLE_MS = 300;

let running = false;

export async function fetchMissingPosters(deps: FetchDeps = {}): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    return await runBatch(deps);
  } finally {
    running = false;
  }
}

// Targeted single-movie fetch by IMDb id — instant, bypasses the batch
// lock/ordering. Leaves metadata_attempted=0 on miss so the batch's
// title chain can still try later. Keeps the old poster until replaced.
export async function refreshPosterById(
  mediaId: number,
  imdbId: string,
  deps: FetchDeps = {},
): Promise<boolean> {
  const { fetchImpl = fetch } = deps;
  const saved = await getSetting('omdb_api_key');
  const omdbKey = saved || process.env.EXPO_PUBLIC_OMDB_API_KEY || null;
  if (!omdbKey) return false;
  try {
    const hit = await omdbPosterById(imdbId, omdbKey, fetchImpl);
    if (!hit) return false;
    await setMediaPoster(mediaId, hit.posterUrl, hit.source);
    console.info(`WatchNow: poster ✓ by IMDb id ${imdbId} → ${hit.source} ${hit.posterUrl}`);
    return true;
  } catch (error) {
    console.warn(`WatchNow: poster by IMDb id failed — ${(error as Error)?.message ?? error}`);
    return false;
  }
}

async function runBatch({
  fetchImpl = fetch,
  sleep = defaultSleep,
}: FetchDeps & { sleep?: (ms: number) => Promise<void> }): Promise<number> {
  const [tmdbKey, savedOmdbKey] = await Promise.all([getSetting('tmdb_api_key'), getSetting('omdb_api_key')]);
  const omdbKey = savedOmdbKey || process.env.EXPO_PUBLIC_OMDB_API_KEY || null;
  const items = await listPendingPosters(40);
  console.info(
    `WatchNow: poster fetch — items=${items.length} tmdbKey=${Boolean(tmdbKey)} omdbKey=${Boolean(omdbKey)} (env omdb=${Boolean(process.env.EXPO_PUBLIC_OMDB_API_KEY)})`,
  );
  let applied = 0;
  let tmdbReachable = true; // TMDB is ISP-blocked in some regions (e.g. India) — probe once, then skip for the batch
  for (const item of items) {
    const hasProvider = Boolean(tmdbKey && tmdbReachable) || Boolean(omdbKey) || item.kind === 'series';
    if (!hasProvider) continue; // no key yet — keep unattempted so a later key picks it up
    let hit: PosterHit | null = null;
    try {
      hit = await resolvePoster(item, tmdbKey, omdbKey, fetchImpl, () => tmdbReachable, (v) => (tmdbReachable = v));
    } catch (error) {
      if ((error as { stop?: boolean }).stop) {
        await markAttempted(item);
        break;
      }
      continue; // network failure: leave unattempted, retry next run
    }
    if (hit) {
      if (item.target === 'media') await setMediaPoster(item.id, hit.posterUrl, hit.source);
      else await setEntryPoster(item.id, hit.posterUrl, hit.source);
      applied++;
      console.info(`WatchNow: poster ✓ "${item.title}" → ${hit.source}`);
    } else {
      await markAttempted(item);
      console.info(`WatchNow: poster ✗ "${item.title}" — no provider match`);
    }
    await sleep(THROTTLE_MS);
  }
  console.info(`WatchNow: poster fetch done — ${applied}/${items.length} applied`);
  return applied;
}

async function resolvePoster(
  item: PendingPoster,
  tmdbKey: string | null,
  omdbKey: string | null,
  fetchImpl: typeof fetch,
  getTmdbReachable: () => boolean,
  setTmdbReachable: (v: boolean) => void,
): Promise<PosterHit | null> {
  const fileYear = extractYear(item.fileName ?? item.title);
  const title = queryTitleOf(item.title) || item.title;
  const attempt = async (fn: () => Promise<PosterHit | null>): Promise<PosterHit | null> => {
    try {
      return await fn();
    } catch (error) {
      if ((error as { stop?: boolean }).stop) throw error;
      console.warn(`WatchNow: poster provider failed, trying next — ${(error as Error)?.message ?? error}`);
      return null; // provider unreachable/failed — fall through to the next one
    }
  };
  if (omdbKey && item.kind === 'movie' && item.imdbId) {
    const { imdbId } = item;
    const key = omdbKey;
    const hit = await attempt(() => omdbPosterById(imdbId, key, fetchImpl));
    if (hit) return hit;
  }
  if (tmdbKey && getTmdbReachable()) {
    try {
      const hit = await tmdbPoster(title, item.kind, tmdbKey, fileYear, fetchImpl);
      if (hit) return hit;
    } catch (error) {
      if ((error as { stop?: boolean }).stop) throw error;
      console.warn(`WatchNow: TMDB unreachable (${(error as Error)?.message ?? error}) — skipping for this batch`);
      setTmdbReachable(false);
    }
  }
  if (item.kind === 'series') {
    const hit = await attempt(() => tvmazePoster(title, fileYear, fetchImpl));
    if (hit) return hit;
  }
  if (omdbKey) {
    const hit = await attempt(() => omdbPoster(title, item.kind, omdbKey, fileYear, fetchImpl));
    if (hit) return hit;
  }
  return null;
}

async function markAttempted(item: PendingPoster): Promise<void> {
  if (item.target === 'media') await markMediaAttempted(item.id);
  else await markEntryAttempted(item.id);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
