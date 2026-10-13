import { isMetadataMatch } from './match';

export type MediaKind = 'movie' | 'series';
export type PosterSource = 'tmdb' | 'tvmaze' | 'omdb';

export type PosterHit = { posterUrl: string; source: PosterSource };
export type FetchDeps = {
  fetchImpl?: typeof fetch;
};

const TIMEOUT_MS = 5000;

async function getJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 429 || res.status === 401) {
    const err = new Error(`HTTP ${res.status}`) as Error & { stop: boolean };
    err.stop = true;
    throw err;
  }
  if (!res.ok) return null;
  return res.json();
}

function imageUrl(path: string | null | undefined, size: string): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export async function tmdbPoster(
  title: string,
  kind: MediaKind,
  apiKey: string,
  fileYear: number | null,
  fetchImpl: typeof fetch = fetch,
): Promise<PosterHit | null> {
  const q = encodeURIComponent(title);
  const yearParam = kind === 'movie' && fileYear ? `&year=${fileYear}` : '';
  const data = (await getJson(
    `https://api.themoviedb.org/3/search/${kind === 'movie' ? 'movie' : 'tv'}?api_key=${apiKey}&query=${q}${yearParam}`,
    fetchImpl,
  )) as { results?: { title?: string; name?: string; poster_path?: string | null; release_date?: string; first_air_date?: string }[] } | null;
  for (const r of data?.results ?? []) {
    const resultTitle = r.title ?? r.name ?? '';
    const yearRaw = (r.release_date ?? r.first_air_date ?? '').slice(0, 4);
    const resultYear = yearRaw ? Number(yearRaw) : null;
    if (!isMetadataMatch(title, resultTitle, fileYear, resultYear)) continue;
    const posterUrl = imageUrl(r.poster_path, 'w500');
    if (posterUrl) return { posterUrl, source: 'tmdb' };
  }
  return null;
}

export async function tvmazePoster(
  title: string,
  fileYear: number | null,
  fetchImpl: typeof fetch = fetch,
): Promise<PosterHit | null> {
  const q = encodeURIComponent(title);
  const data = (await getJson(`https://api.tvmaze.com/search/shows?q=${q}`, fetchImpl)) as
    | { show?: { name?: string; image?: { original?: string } | null; premiered?: string | null } }[]
    | null;
  for (const r of data ?? []) {
    const show = r.show;
    if (!show?.name || !show.image?.original) continue;
    const resultYear = show.premiered ? Number(show.premiered.slice(0, 4)) : null;
    if (!isMetadataMatch(title, show.name, fileYear, resultYear)) continue;
    return { posterUrl: show.image.original, source: 'tvmaze' };
  }
  return null;
}

export async function omdbPoster(
  title: string,
  kind: MediaKind,
  apiKey: string,
  fileYear: number | null,
  fetchImpl: typeof fetch = fetch,
): Promise<PosterHit | null> {
  const q = encodeURIComponent(title);
  const yearParam = fileYear ? `&y=${fileYear}` : '';
  const data = (await getJson(
    `https://www.omdbapi.com/?apikey=${apiKey}&type=${kind === 'movie' ? 'movie' : 'series'}&t=${q}${yearParam}`,
    fetchImpl,
  )) as { Title?: string; Year?: string; Poster?: string; Response?: string } | null;
  if (!data || data.Response === 'False' || !data.Title || !data.Poster || data.Poster === 'N/A') return null;
  const yearRaw = (data.Year ?? '').slice(0, 4);
  const resultYear = /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;
  if (!isMetadataMatch(title, data.Title, fileYear, resultYear)) return null;
  return { posterUrl: data.Poster, source: 'omdb' };
}

// Exact lookup by IMDb id (i=tt...). Authoritative — no title/year matching.
// kind must match the id's type so a wrong-kind id falls back to the title chain.
export async function omdbPosterById(
  imdbId: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  kind: MediaKind = 'movie',
): Promise<PosterHit | null> {
  const data = (await getJson(
    `https://www.omdbapi.com/?apikey=${apiKey}&i=${encodeURIComponent(imdbId)}`,
    fetchImpl,
  )) as { Title?: string; Poster?: string; Type?: string; Response?: string } | null;
  if (!data || data.Response === 'False' || !data.Title || !data.Poster || data.Poster === 'N/A') return null;
  if (data.Type && data.Type !== kind) return null;
  return { posterUrl: data.Poster, source: 'omdb' };
}
