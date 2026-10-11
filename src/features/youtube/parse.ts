/**
 * Extracts the bare playlist id from any URL/shape YouTube produces.
 * Pure and offline — no network, no side effects.
 */

// Playlist ids start with PL / UU (uploads) / OL (offline) / LL (liked) / FL
// / RD (radio/mix) and are typically 13–42 chars of [A-Za-z0-9_-].
const BARE_ID = /^(PL|UU|OL|LL|FL|RD)[A-Za-z0-9_-]{10,}$/;

export function parsePlaylistId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (BARE_ID.test(raw)) return raw;

  let url: URL | null = null;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^(www|m|music|music-m)\./, '');
  if (host !== 'youtube.com' && host !== 'youtu.be' && host !== 'youtube-nocookie.com') {
    return null;
  }

  const list = url.searchParams.get('list');
  if (list && BARE_ID.test(list)) return list;

  return null;
}
