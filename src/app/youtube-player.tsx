import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import YoutubePlayer, {
  PLAYER_STATES,
  type YoutubeIframeRef,
} from 'react-native-youtube-iframe';

import { getPlaylistVideos, saveVideoProgress, type YoutubeVideo } from '@/features/youtube/store';
import { colors, font, radius, spacing } from '@/theme/colors';

// One episode per mount (key on videoId): the iframe HTML bakes the video id in,
// so a fresh WebView per episode is the reliable way to switch + resume.
export default function YoutubePlayerScreen() {
  const { playlistId, videoId } = useLocalSearchParams<{ playlistId: string; videoId: string }>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [videos, setVideos] = useState<YoutubeVideo[] | null>(null);
  const [index, setIndex] = useState(0);
  const [playerState, setPlayerState] = useState<string>(PLAYER_STATES.UNSTARTED);
  const [upNext, setUpNext] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const playerRef = useRef<YoutubeIframeRef | null>(null);
  const lastTimeRef = useRef(0);

  const playlistRowId = Number(playlistId);
  const videoRowId = Number(videoId);

  useEffect(() => {
    if (!Number.isFinite(playlistRowId)) return;
    let mounted = true;
    getPlaylistVideos(playlistRowId)
      .then((rows) => {
        if (!mounted) return;
        const start = rows.findIndex((v) => v.id === videoRowId);
        setVideos(rows);
        setIndex(start >= 0 ? start : 0);
      })
      .catch(() => {
        if (mounted) setVideos([]);
      });
    return () => {
      mounted = false;
    };
  }, [playlistRowId, videoRowId]);

  // YouTube playback is landscape-first; same lock/unlock pattern as player.tsx.
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => undefined);
    return () => {
      ScreenOrientation.unlockAsync().catch(() => undefined);
    };
  }, []);

  const current = videos?.[index] ?? null;
  const next = videos && index + 1 < videos.length ? videos[index + 1] : null;

  const saveNow = useCallback(
    (completed?: boolean) => {
      if (!current) return;
      saveVideoProgress(current.id, lastTimeRef.current * 1000, current.durationSeconds, completed).catch(
        () => undefined,
      );
    },
    [current],
  );

  const advance = useCallback(() => {
    setUpNext(false);
    setErrorMsg(null);
    lastTimeRef.current = 0;
    setIndex((i) => i + 1);
  }, []);

  const onReady = useCallback(() => {
    const resumeMs = current?.positionMs ?? 0;
    if (resumeMs > 5000) playerRef.current?.seekTo(resumeMs / 1000, true);
  }, [current]);

  const onStateChange = useCallback(
    (state: PLAYER_STATES) => {
      setPlayerState(state);
      if (state === PLAYER_STATES.ENDED) {
        saveNow(true);
        if (videos && index + 1 < videos.length) setUpNext(true);
      } else if (state === PLAYER_STATES.PAUSED) {
        saveNow(false);
      }
    },
    [index, saveNow, videos],
  );

  const onPlayerError = useCallback((err: string) => {
    setErrorMsg(
      err === 'embed_not_allowed' || err === 'video_not_found'
        ? 'This video can’t be played here — it was removed, made private, or embedding is disabled.'
        : 'Playback failed to load. Check your connection and try again.',
    );
  }, []);

  const onBack = useCallback(() => {
    saveNow(false);
    router.back();
  }, [saveNow]);

  // Auto-advance a few seconds after an episode ends.
  useEffect(() => {
    if (!upNext) return;
    const timer = setTimeout(advance, 6000);
    return () => clearTimeout(timer);
  }, [upNext, advance]);

  // Poll the playhead while playing so a crash or swipe-away keeps progress.
  useEffect(() => {
    if (playerState !== PLAYER_STATES.PLAYING) return;
    const timer = setInterval(() => {
      playerRef.current
        ?.getCurrentTime()
        .then((t) => {
          lastTimeRef.current = t;
        })
        .catch(() => undefined);
    }, 5000);
    return () => clearInterval(timer);
  }, [playerState]);

  // Fit a 16:9 player inside the window in either orientation (landscape width
  // alone would overflow the screen height).
  const videoWidth = Math.min(width, Math.floor((height * 16) / 9));
  const videoHeight = Math.round(videoWidth * (9 / 16));

  return (
    <View style={styles.container}>
      <StatusBar hidden style="light" />
      {videos === null ? (
        <ActivityIndicator color={colors.accent} />
      ) : !current ? (
        <View style={styles.missing}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
          <Text style={styles.missingText}>Episode not found in this playlist.</Text>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={styles.missingAction}>Go back</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ width: videoWidth, height: videoHeight }}>
          <YoutubePlayer
            key={current.videoId}
            ref={playerRef}
            height={videoHeight}
            width={videoWidth}
            videoId={current.videoId}
            play
            forceAndroidAutoplay
            onReady={onReady}
            onChangeState={onStateChange}
            onError={onPlayerError}
          />
        </View>
      )}

      {/* UP NEXT */}
      {upNext && next ? (
        <View style={[styles.overlay, { bottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.overlayLabel}>Up next</Text>
          <Text style={styles.overlayTitle} numberOfLines={2}>
            #{next.position + 1} · {next.title}
          </Text>
          <View style={styles.overlayActions}>
            <Pressable onPress={advance} style={({ pressed }) => [styles.overlayBtn, pressed && styles.pressed]}>
              <Ionicons name="play" size={16} color="#000" />
              <Text style={styles.overlayBtnText}>Play now</Text>
            </Pressable>
            <Pressable
              onPress={() => setUpNext(false)}
              style={({ pressed }) => [styles.overlayBtnGhost, pressed && styles.pressed]}>
              <Text style={styles.overlayBtnGhostText}>Not now</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* ERROR */}
      {errorMsg ? (
        <View style={[styles.overlay, { bottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.overlayLabelError}>Can’t play</Text>
          <Text style={styles.overlayTitle} numberOfLines={3}>
            {errorMsg}
          </Text>
          <View style={styles.overlayActions}>
            {next ? (
              <Pressable
                onPress={advance}
                style={({ pressed }) => [styles.overlayBtn, pressed && styles.pressed]}>
                <Ionicons name="play-skip-forward" size={16} color="#000" />
                <Text style={styles.overlayBtnText}>Skip to next</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onBack}
              style={({ pressed }) => [styles.overlayBtnGhost, pressed && styles.pressed]}>
              <Text style={styles.overlayBtnGhostText}>Back</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  overlayLabel: {
    color: colors.accent,
    fontSize: font.small,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  overlayLabelError: {
    color: colors.warning,
    fontSize: font.small,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  overlayTitle: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  overlayActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  overlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#fff',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  overlayBtnText: {
    color: '#000',
    fontSize: font.caption,
    fontWeight: '800',
  },
  overlayBtnGhost: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  overlayBtnGhostText: {
    color: colors.textSecondary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
  missing: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  missingText: {
    color: colors.textSecondary,
    fontSize: font.body,
  },
  missingAction: {
    color: colors.accent,
    fontSize: font.body,
    fontWeight: '700',
  },
});
