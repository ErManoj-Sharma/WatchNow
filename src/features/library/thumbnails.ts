import { useEffect, useState } from 'react';
import { getThumbnailAsync } from 'expo-video-thumbnails';

import { getMedia, setMediaThumbnail } from '@/db/repositories';

const inflight = new Map<number, Promise<string | null>>();

export async function ensureThumbnail(mediaId: number): Promise<string | null> {
  const existing = inflight.get(mediaId);
  if (existing) return existing;
  const task = (async () => {
    try {
      const media = await getMedia(mediaId);
      if (!media) return null;
      if (media.thumbnailPath) return media.thumbnailPath;
      const result = await getThumbnailAsync(media.documentUri, { time: 1000, quality: 0.6 });
      await setMediaThumbnail(mediaId, result.uri);
      return result.uri;
    } catch (error) {
      inflight.delete(mediaId);
      console.warn(`WatchNow: thumbnail generation failed for media ${mediaId}`, error);
      return null;
    }
  })();
  inflight.set(mediaId, task);
  return task;
}

export function useThumbnail(mediaId: number | null | undefined, initial: string | null): string | null {
  const [path, setPath] = useState<string | null>(initial);
  useEffect(() => {
    if (mediaId == null) return;
    let mounted = true;
    ensureThumbnail(mediaId).then((p) => {
      if (mounted && p) setPath(p);
    });
    return () => {
      mounted = false;
    };
  }, [mediaId, initial]);
  return path;
}

export function clearThumbnailMemoryCache() {
  inflight.clear();
}
