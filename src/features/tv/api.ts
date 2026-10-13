// Fetch + classify a TV playlist URL (IPTV .m3u channel list or raw .m3u8 HLS).
import { defaultPlaylistName, parseM3u, type M3uContent, type ParsedChannel } from './parse';

export type FetchedTvPlaylist = { name: string; content: M3uContent };

export async function fetchTvPlaylist(url: string): Promise<FetchedTvPlaylist> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  const text = await res.text();
  const content = parseM3u(text, url);
  if (content.kind === 'invalid') throw new Error('Not a valid M3U/M3U8 file');
  return { name: defaultPlaylistName(url, content.kind), content };
}

/** Single playable entry for an HLS master (the player picks the variant). */
export function hlsAsChannel(url: string, name: string): ParsedChannel[] {
  return [{ name, streamUrl: url, logoUrl: null, groupName: null }];
}
