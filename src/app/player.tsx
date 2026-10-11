import { useEventListener } from 'expo';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import {
  entryForMedia,
  findNextEpisode,
  getMedia,
  getProgress,
  saveProgress,
  updateMediaDuration,
  type MediaInfo,
} from '@/db/repositories';
import { colors, font, spacing } from '@/theme/colors';

type EntryMeta = Awaited<ReturnType<typeof entryForMedia>>;

export default function PlayerScreen() {
  const params = useLocalSearchParams<{ mediaId?: string; entryId?: string }>();
  const mediaId = Number(params.mediaId);
  const insets = useSafeAreaInsets();
  const [media, setMedia] = useState<MediaInfo | null>(null);
  const [entry, setEntry] = useState<EntryMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNext, setShowNext] = useState<{ mediaId: number; episodeId: number; label: string } | null>(null);

  const resumeRef = useRef(0);
  const seekedRef = useRef(false);
  const lastSavedRef = useRef(0);

  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 5;
    p.keepScreenOnWhilePlaying = true;
  });

  useEffect(() => {
    if (!Number.isFinite(mediaId)) return;
    let mounted = true;
    Promise.all([getMedia(mediaId), getProgress(mediaId), entryForMedia(mediaId)])
      .then(([m, prog, e]) => {
        if (!mounted) return;
        setMedia(m);
        setEntry(e);
        if (prog && !prog.completed) resumeRef.current = prog.positionMs;
        if (m) player.replace(m.documentUri);
        else setError('File not found');
      })
      .catch(() => mounted && setError('Could not load file'));
    return () => {
      mounted = false;
    };
  }, [mediaId, player]);

  const saveNow = useCallback(
    (completed?: boolean) => {
      if (!Number.isFinite(mediaId)) return;
      const positionMs = player.currentTime * 1000;
      const durationMs = player.duration > 0 ? player.duration * 1000 : null;
      if (positionMs < 1000 && !completed) return;
      saveProgress(mediaId, positionMs, durationMs, completed).catch(() => undefined);
      if (durationMs) updateMediaDuration(mediaId, durationMs).catch(() => undefined);
    },
    [mediaId, player],
  );

  const loadNext = useCallback(async () => {
    if (!entry || entry.kind !== 'episode' || entry.seriesId == null || entry.seasonNumber == null || entry.episodeNumber == null) return;
    const next = await findNextEpisode(entry.seriesId, entry.seasonNumber, entry.episodeNumber);
    if (next) {
      setShowNext({
        mediaId: next.mediaId,
        episodeId: next.episodeId,
        label: `Play next · S${next.seasonNumber}E${next.episodeNumber} ${next.title}`,
      });
    }
  }, [entry]);

  useEventListener(player, 'statusChange', ({ status, error: playerError }) => {
    if (status === 'error') {
      setError(playerError?.message ?? 'This file could not be played. The codec or container may be unsupported.');
      return;
    }
    if (status === 'readyToPlay' && !seekedRef.current) {
      seekedRef.current = true;
      if (player.duration > 0) updateMediaDuration(mediaId, player.duration * 1000).catch(() => undefined);
      if (resumeRef.current > 5) {
        player.currentTime = resumeRef.current / 1000;
      }
      player.play();
    }
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    const now = Date.now();
    if (now - lastSavedRef.current > 10000) {
      lastSavedRef.current = now;
      saveProgress(mediaId, currentTime * 1000, player.duration > 0 ? player.duration * 1000 : null).catch(() => undefined);
    }
  });

  useEventListener(player, 'playToEnd', () => {
    saveNow(true);
    loadNext();
  });

  useFocusEffect(
    useCallback(() => {
      return () => {
        saveNow();
      };
    }, [saveNow]),
  );

  const displayTitle =
    entry?.kind === 'episode' && entry.seriesTitle
      ? `${entry.seriesTitle} · S${entry.seasonNumber}E${entry.episodeNumber}`
      : (media?.fileName ?? '');

  return (
    <View style={styles.container}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls
        contentFit="contain"
        fullscreenOptions={{ enable: true, orientation: 'landscape' }}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.xs }]} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {displayTitle}
        </Text>
      </View>

      {showNext ? (
        <View style={[styles.nextBar, { bottom: insets.bottom + spacing.xl }]}>
          <Button
            label={showNext.label}
            onPress={() => {
              seekedRef.current = false;
              resumeRef.current = 0;
              setShowNext(null);
              setMedia(null);
              setEntry(null);
              router.replace({
                pathname: '/player',
                params: { mediaId: String(showNext.mediaId), entryId: String(showNext.episodeId) },
              } as never);
            }}
          />
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorTitle}>Playback error</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Button label="Go back" onPress={() => router.back()} style={{ marginTop: spacing.md, alignSelf: 'stretch' }} />
        </View>
      ) : null}

      {!media && !error ? (
        <View style={styles.loader} pointerEvents="none">
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  back: {
    paddingVertical: spacing.xs,
  },
  backText: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  title: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '600',
    flex: 1,
  },
  nextBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  errorTitle: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: font.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  loader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
