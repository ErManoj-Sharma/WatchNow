// Pure M3U/M3U8 parsing — no React Native imports, so tests run under tsx.

export type ParsedChannel = {
  name: string;
  streamUrl: string;
  logoUrl: string | null;
  groupName: string | null;
};

export type M3uContent =
  | { kind: 'channels'; channels: ParsedChannel[] }
  | { kind: 'hls'; url: string }
  | { kind: 'invalid' };

/**
 * Classify + parse a downloaded playlist body.
 * - IPTV channel list (#EXTINF + URL lines) → channels with logo/group
 * - Raw HLS master (#EXT-X-STREAM-INF) → single 'hls' (caller plays sourceUrl directly)
 * - Anything else → invalid
 */
export function parseM3u(text: string, sourceUrl: string): M3uContent {
  if (/#EXT-X-STREAM-INF/i.test(text)) return { kind: 'hls', url: sourceUrl };
  if (!/#EXTINF/i.test(text)) return { kind: 'invalid' };

  const channels: ParsedChannel[] = [];
  let pending: { name: string; logoUrl: string | null; groupName: string | null } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const logoUrl = line.match(/tvg-logo="([^"]*)"/i)?.[1] || null;
      const groupName = line.match(/group-title="([^"]*)"/i)?.[1] || null;
      const comma = line.indexOf(',');
      const name = (comma >= 0 ? line.slice(comma + 1) : '').trim() || 'Unknown channel';
      pending = { name, logoUrl, groupName };
    } else if (!line.startsWith('#') && pending) {
      channels.push({ name: pending.name, streamUrl: line, logoUrl: pending.logoUrl, groupName: pending.groupName });
      pending = null;
    }
  }
  return channels.length > 0 ? { kind: 'channels', channels } : { kind: 'invalid' };
}

/** Human name for a saved playlist: file name for channel lists, host for HLS. */
export function defaultPlaylistName(url: string, kind: 'channels' | 'hls'): string {
  try {
    const u = new URL(url);
    const segment = u.pathname.split('/').filter(Boolean).pop() ?? '';
    const base = decodeURIComponent(segment).replace(/\.(m3u8?|txt)$/i, '');
    if (kind === 'channels' && base) return base;
    return u.hostname.replace(/^www\./, '');
  } catch {
    return 'TV Playlist';
  }
}
