import { useEffect, useState } from 'react';
import type { SharedRefType } from 'expo';
import { createVideoPlayer, type VideoPlayer } from 'expo-video';

import { getMedia, updateMediaDuration } from '@/db/repositories';

type ImageRef = SharedRefType<'image'>;

const READY_TIMEOUT_MS = 10000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function waitReady(player: VideoPlayer, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sub.remove();
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') done(true);
      else if (status === 'error') done(false);
    });
    if (player.status === 'readyToPlay') done(true);
    else if (player.status === 'error') done(false);
  });
}

// Past intros/openers but not mid-spoiler; falls back to mid-file if empty.
function thumbTimes(durationSec: number): number[] {
  const smart = durationSec > 10 ? Math.min(45, Math.round(durationSec * 0.2)) : 1;
  const mid = Math.max(1, Math.round(durationSec / 2));
  return smart === mid ? [smart] : [smart, mid];
}

// Thumbs come from the same EXO player that plays the video — MediaMetadataRetriever
// "succeeds" with all-black frames on many MKV/HEVC rips (seen on device). Native
// image refs can't be persisted, so they live for the session only; queue keeps a
// season's worth of files from spawning a pile of decoders at once.
const thumbs = new Map<number, ImageRef>();
const inflight = new Map<number, Promise<ImageRef | null>>();
let queue: Promise<unknown> = Promise.resolve();

/**
 * Queued player-based thumbnail for one media. Also persists duration (both are
 * otherwise only learned during playback). Resolves with a native image ref
 * usable directly as an expo-image source.
 */
export function ensureThumbnail(mediaId: number): Promise<ImageRef | null> {
  const cached = thumbs.get(mediaId);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(mediaId);
  if (existing) return existing;
  const task = queue
    .then(async (): Promise<ImageRef | null> => {
      try {
        const again = thumbs.get(mediaId);
        if (again) return again;
        let media = await getMedia(mediaId).catch(() => null);
        if (!media) {
          await sleep(400);
          media = await getMedia(mediaId).catch(() => null);
        }
        if (!media) return null;
        const player = createVideoPlayer(media.documentUri);
        try {
          const ok = await waitReady(player, READY_TIMEOUT_MS);
          if (!ok) return null;
          if ((media.durationMs == null || media.durationMs <= 0) && player.duration > 0) {
            await updateMediaDuration(mediaId, player.duration * 1000).catch(() => undefined);
          }
          for (const t of thumbTimes(player.duration)) {
            const [thumb] = await player.generateThumbnailsAsync([t], { maxWidth: 640 });
            if (thumb) {
              thumbs.set(mediaId, thumb);
              return thumb;
            }
          }
          console.warn(`WatchNow: player produced no thumbnail for media ${mediaId}`);
          return null;
        } finally {
          player.replace(null, true);
        }
      } catch (error) {
        console.warn(`WatchNow: thumbnail failed for media ${mediaId}`, error);
        return null;
      }
    })
    .catch(() => null);
  inflight.set(mediaId, task);
  queue = task;
  return task;
}

export type ThumbSource = string | ImageRef | null;

export function useThumbnail(mediaId: number | null | undefined, initial: string | null): ThumbSource {
  const [thumb, setThumb] = useState<ImageRef | null>(null);
  useEffect(() => {
    if (mediaId == null) return;
    let mounted = true;
    ensureThumbnail(mediaId).then((r) => {
      if (mounted && r) setThumb(r);
    });
    return () => {
      mounted = false;
    };
  }, [mediaId]);
  return thumb ?? initial;
}

export function clearThumbnailMemoryCache() {
  thumbs.clear();
}
