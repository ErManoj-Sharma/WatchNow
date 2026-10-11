import { useEffect, useState } from 'react';
import { getThumbnailAsync } from 'expo-video-thumbnails';

import { getMedia, setMediaThumbnail } from '@/db/repositories';

const ready = new Map<number, string>();
const inflight = new Set<number>();

export async function ensureThumbnail(mediaId: number): Promise<string | null> {
  const cached = ready.get(mediaId);
  if (cached) return cached;
  if (inflight.has(mediaId)) return null;
  inflight.add(mediaId);
  try {
    const media = await getMedia(mediaId);
    if (!media) return null;
    if (media.thumbnailPath) {
      ready.set(mediaId, media.thumbnailPath);
      return media.thumbnailPath;
    }
    const result = await getThumbnailAsync(media.documentUri, { time: 1000, quality: 0.6 });
    ready.set(mediaId, result.uri);
    await setMediaThumbnail(mediaId, result.uri);
    return result.uri;
  } catch {
    return null;
  } finally {
    inflight.delete(mediaId);
  }
}

export function useThumbnail(mediaId: number | null | undefined, initial: string | null): string | null {
  const [path, setPath] = useState<string | null>(() =>
    mediaId != null ? (ready.get(mediaId) ?? initial) : initial,
  );
  useEffect(() => {
    if (mediaId == null) return;
    let mounted = true;
    ensureThumbnail(mediaId)
      .then((p) => {
        if (mounted && p) setPath(p);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [mediaId]);
  return path;
}

export function clearThumbnailMemoryCache() {
  ready.clear();
}
