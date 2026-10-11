/**
 * YouTube Data API v3 client. The key comes from EXPO_PUBLIC_YOUTUBE_API_KEY
 * (.env) — the app only reads public playlist data, no OAuth.
 *
 * Quota cost: playlists.list = 1, playlistItems.list = 1/page(50),
 * videos.list = 1/batch(50). A 100-video playlist ≈ 4 units of the
 * default 10,000/day.
 */

export type PlaylistMeta = {
  playlistId: string;
  title: string;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  videoCount: number;
};

export type ApiVideoRow = {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  position: number;
};

type YoutubeThumbnails = Record<string, { url: string; width?: number; height?: number } | undefined>;

const API = 'https://www.googleapis.com/youtube/v3';
const PAGE_SIZE = 50;

// YouTube marks dead entries with these titles rather than omitting them.
const DEAD_TITLES = new Set(['Deleted video', 'Private video', 'Unavailable video']);

function apiKey(): string {
  const key = process.env.EXPO_PUBLIC_YOUTUBE_API_KEY;
  if (!key) throw new Error('No YouTube API key set. Add EXPO_PUBLIC_YOUTUBE_API_KEY to .env and reload.');
  return key;
}

/** Largest thumbnail that exists; maxres often 404s on older uploads, so fall back. */
export function pickThumbnail(thumbnails: YoutubeThumbnails | undefined | null): string | null {
  if (!thumbnails) return null;
  for (const size of ['maxres', 'standard', 'high', 'medium', 'default']) {
    const url = thumbnails[size]?.url;
    if (url) return url;
  }
  return null;
}

/** ISO-8601 duration (PT1H2M3S) → seconds. */
export function parseIsoDuration(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!match) return null;
  const [, d, h, m, s] = match;
  if (!d && !h && !m && !s) return null;
  return (Number(d ?? 0) * 86400) + (Number(h ?? 0) * 3600) + (Number(m ?? 0) * 60) + Number(s ?? 0);
}

type PlaylistItemsResponse = {
  items?: {
    snippet?: { title?: string; thumbnails?: YoutubeThumbnails };
    contentDetails?: { videoId?: string };
  }[];
  nextPageToken?: string;
};

/** playlistItems page → live rows, dropping deleted/private entries. */
export function mapPlaylistItems(json: PlaylistItemsResponse, startIndex = 0): ApiVideoRow[] {
  const rows: ApiVideoRow[] = [];
  for (const item of json.items ?? []) {
    const videoId = item.contentDetails?.videoId;
    const title = item.snippet?.title ?? '';
    if (!videoId || DEAD_TITLES.has(title)) continue;
    rows.push({
      videoId,
      title,
      thumbnailUrl: pickThumbnail(item.snippet?.thumbnails),
      durationSeconds: null,
      position: startIndex + rows.length,
    });
  }
  return rows;
}

type PlaylistsResponse = {
  items?: {
    id?: string;
    snippet?: { title?: string; channelTitle?: string; thumbnails?: YoutubeThumbnails };
    contentDetails?: { itemCount?: number };
  }[];
};

export function mapPlaylistMeta(json: PlaylistsResponse): PlaylistMeta | null {
  const item = json.items?.[0];
  if (!item?.id) return null;
  return {
    playlistId: item.id,
    title: item.snippet?.title ?? 'Untitled playlist',
    channelTitle: item.snippet?.channelTitle ?? null,
    thumbnailUrl: pickThumbnail(item.snippet?.thumbnails),
    videoCount: item.contentDetails?.itemCount ?? 0,
  };
}

type VideosResponse = {
  items?: { id?: string; contentDetails?: { duration?: string } }[];
};

/** videoId → duration in seconds (missing videos omitted). */
export function mapVideoDurations(json: VideosResponse): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of json.items ?? []) {
    if (!item.id) continue;
    const seconds = parseIsoDuration(item.contentDetails?.duration);
    if (seconds != null && seconds > 0) out.set(item.id, seconds);
  }
  return out;
}

async function callApi(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${API}/${path}`);
  url.searchParams.set('key', apiKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch {
    throw new Error('Network error — check your connection and try again.');
  }
  if (res.status === 403) {
    throw new Error('API key rejected, or the daily YouTube quota is exhausted.');
  }
  if (res.status === 404) throw new Error('Playlist not found — is it public?');
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message || `YouTube API error (${res.status}).`);
  }
  return res.json();
}

export async function fetchPlaylistMeta(playlistId: string): Promise<PlaylistMeta> {
  const json = (await callApi('playlists', {
    part: 'snippet,contentDetails',
    id: playlistId,
  })) as PlaylistsResponse;
  const meta = mapPlaylistMeta(json);
  if (!meta) throw new Error('Playlist not found — is it public?');
  return meta;
}

/** All live videos in playlist order, paginated 50 at a time. */
export async function fetchPlaylistItems(playlistId: string): Promise<ApiVideoRow[]> {
  const rows: ApiVideoRow[] = [];
  let pageToken: string | undefined;
  do {
    const params: Record<string, string> = {
      part: 'snippet,contentDetails',
      playlistId,
      maxResults: String(PAGE_SIZE),
    };
    if (pageToken) params.pageToken = pageToken;
    const json = (await callApi('playlistItems', params)) as PlaylistItemsResponse;
    rows.push(...mapPlaylistItems(json, rows.length));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return rows;
}

/** Durations for up to 50 videos per call; a failure here is never fatal. */
export async function fetchVideoDurations(videoIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < videoIds.length; i += PAGE_SIZE) {
    const batch = videoIds.slice(i, i + PAGE_SIZE);
    try {
      const json = (await callApi('videos', {
        part: 'contentDetails',
        id: batch.join(','),
      })) as VideosResponse;
      for (const [id, seconds] of mapVideoDurations(json)) out.set(id, seconds);
    } catch (error) {
      console.warn('WatchNow: duration lookup failed for a batch', error);
    }
  }
  return out;
}

/** One call site for a full sync: meta + items + durations. */
export async function fetchPlaylistWithItems(
  playlistId: string,
): Promise<{ meta: PlaylistMeta; items: ApiVideoRow[] }> {
  const meta = await fetchPlaylistMeta(playlistId);
  const items = await fetchPlaylistItems(playlistId);
  const durations = await fetchVideoDurations(items.map((i) => i.videoId));
  for (const item of items) item.durationSeconds = durations.get(item.videoId) ?? null;
  return { meta, items };
}
