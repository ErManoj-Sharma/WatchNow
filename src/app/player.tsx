import { useEventListener } from 'expo';
import * as NavigationBar from 'expo-navigation-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
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
import { formatDuration } from '@/utils/format';

type EntryMeta = Awaited<ReturnType<typeof entryForMedia>>;

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  return formatDuration(Math.round(seconds * 1000));
}

export default function PlayerScreen() {
  const params = useLocalSearchParams<{ mediaId?: string; entryId?: string }>();
  const mediaId = Number(params.mediaId);
  const insets = useSafeAreaInsets();
  const [media, setMedia] = useState<MediaInfo | null>(null);
  const [entry, setEntry] = useState<EntryMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNext, setShowNext] = useState<{ mediaId: number; episodeId: number; label: string } | null>(null);
  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [audioPickerOpen, setAudioPickerOpen] = useState(false);
  const [showSpeedBadge, setShowSpeedBadge] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [chromeNonce, setChromeNonce] = useState(0);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActive = useRef(false);

  const resumeRef = useRef(0);
  const seekedRef = useRef(false);
  const lastSavedRef = useRef(0);
  // Last-known values so saveNow() never touches the native player (it may already
  // be released when the focus cleanup runs on back-navigation).
  const lastPosRef = useRef(0);
  const lastDurRef = useRef(0);

  const barWidthRef = useRef(1);
  const dragRef = useRef<number | null>(null);

  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 0.5;
    p.keepScreenOnWhilePlaying = true;
    p.preservesPitch = true;
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
        if (m) player.replaceAsync(m.documentUri).catch(() => setError('Could not load file'));
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
      const positionMs = lastPosRef.current * 1000;
      const durationMs = lastDurRef.current > 0 ? lastDurRef.current * 1000 : null;
      if (positionMs < 1000 && !completed) return;
      saveProgress(mediaId, positionMs, durationMs, completed).catch(() => undefined);
      if (durationMs) updateMediaDuration(mediaId, durationMs).catch(() => undefined);
    },
    [mediaId],
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
      const raw = playerError?.message ?? 'This file could not be played.';
      // Device lacks a decoder for the audio/video codec (e.g. EAC3/Dolby on many phones)
      const codecIssue = /decoder init failed|unsupported type|eac3|ac3|no decoder/i.test(raw);
      setError(
        codecIssue
          ? 'Your device cannot decode an audio/video codec in this file (often Dolby/EAC3). Try a different rip with AAC audio, or re-encode the file’s audio to AAC.'
          : raw,
      );
      return;
    }
    if (status === 'readyToPlay' && !seekedRef.current) {
      seekedRef.current = true;
      if (player.duration > 0) {
        lastDurRef.current = player.duration;
        setDurationSec(player.duration);
        updateMediaDuration(mediaId, player.duration * 1000).catch(() => undefined);
      }
      if (resumeRef.current > 5) {
        player.currentTime = resumeRef.current / 1000;
      }
      player.play();
      setPlaying(true);
    }
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    lastPosRef.current = currentTime;
    if (player.duration > 0) lastDurRef.current = player.duration;
    setPositionSec(currentTime);
    const now = Date.now();
    if (now - lastSavedRef.current > 10000) {
      lastSavedRef.current = now;
      saveProgress(mediaId, currentTime * 1000, player.duration > 0 ? player.duration * 1000 : null).catch(() => undefined);
    }
  });

  useEventListener(player, 'playToEnd', () => {
    lastPosRef.current = lastDurRef.current;
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

  // Auto-hide chrome a few seconds after the last interaction while playing.
  useEffect(() => {
    if (!controlsVisible || !playing || audioPickerOpen) return;
    const t = setTimeout(() => {
      setControlsVisible(false);
      setAudioPickerOpen(false);
    }, 3000);
    return () => clearTimeout(t);
  }, [chromeNonce, controlsVisible, playing, audioPickerOpen]);

  // Hide the Android system nav bar during playback; restore on exit.
  useEffect(() => {
    return () => {
      NavigationBar.setVisibilityAsync('visible').catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    NavigationBar.setVisibilityAsync(controlsVisible ? 'visible' : 'hidden').catch(() => undefined);
  }, [controlsVisible]);

  const bumpChrome = useCallback(() => {
    setChromeNonce((n) => n + 1);
    setControlsVisible(true);
  }, []);

  const toggleChrome = useCallback(() => {
    setChromeNonce((n) => n + 1);
    setControlsVisible((v) => !v);
  }, []);

  const togglePlay = useCallback(() => {
    if (player.playing) {
      player.pause();
      setPlaying(false);
    } else {
      player.play();
      setPlaying(true);
    }
  }, [player]);

  const cycleSubtitle = useCallback(() => {
    const tracks = player.availableSubtitleTracks;
    if (tracks.length === 0) return;
    const current = player.subtitleTrack;
    if (!current) {
      // Off → first track
      const first = tracks.find((t) => t.id !== 'off') ?? tracks[0];
      player.subtitleTrack = first;
      return;
    }
    const idx = tracks.findIndex((t) => t.id === current.id);
    // Past the last track → off
    player.subtitleTrack = idx >= 0 && idx + 1 < tracks.length ? tracks[idx + 1] : null;
  }, [player]);

  const seekRatio = (locationX: number) => Math.min(1, Math.max(0, locationX / Math.max(1, barWidthRef.current)));

  const onSeekGrant = useCallback((e: GestureResponderEvent) => {
    bumpChrome();
    dragRef.current = seekRatio(e.nativeEvent.locationX) * lastDurRef.current;
    setPositionSec(dragRef.current);
  }, [bumpChrome]);

  const onSeekMove = useCallback((e: GestureResponderEvent) => {
    dragRef.current = seekRatio(e.nativeEvent.locationX) * lastDurRef.current;
    setPositionSec(dragRef.current);
  }, []);

  const onSeekRelease = useCallback(() => {
    if (dragRef.current != null) {
      player.currentTime = dragRef.current;
      lastPosRef.current = dragRef.current;
    }
    dragRef.current = null;
  }, [player]);

  const startHold = useCallback(() => {
    holdTimer.current = setTimeout(() => {
      holdActive.current = true;
      player.playbackRate = 2;
      setShowSpeedBadge(true);
    }, 250);
  }, [player]);

  const endHold = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (holdActive.current) {
      player.playbackRate = 1;
      setShowSpeedBadge(false);
      holdActive.current = false;
    }
  }, [player]);

  // One responder chain for both gestures: quick tap toggles chrome, hold = 2x
  const onVideoGrant = useCallback(() => {
    startHold();
  }, [startHold]);

  const onVideoRelease = useCallback(() => {
    const wasHold = holdActive.current;
    endHold();
    if (!wasHold) toggleChrome();
  }, [endHold, toggleChrome]);

  const enterImmersive = useCallback(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => undefined);
    setImmersive(true);
  }, []);

  const exitImmersive = useCallback(() => {
    setImmersive(false);
    ScreenOrientation.unlockAsync().catch(() => undefined);
  }, []);

  useEffect(() => {
    return () => {
      ScreenOrientation.unlockAsync().catch(() => undefined);
    };
  }, []);

  const displayTitle =
    entry?.kind === 'episode' && entry.seriesTitle
      ? `${entry.seriesTitle} · S${entry.seasonNumber}E${entry.episodeNumber}`
      : (media?.fileName ?? '');

  const subtitleLabel = player.subtitleTrack && player.subtitleTrack.id !== 'off' ? 'CC ON' : 'CC';
  const audioLabel = player.audioTrack
    ? ((val) => (val ? val.charAt(0).toUpperCase() + val.slice(1).toLowerCase() : 'Audio'))(
        player.audioTrack.language || player.audioTrack.label,
      )
    : 'Audio';

  return (
    <View style={styles.container}>
      <StatusBar hidden={!controlsVisible} style="light" />
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls={false}
        contentFit="contain"
        fullscreenOptions={{ enable: false }}
      />

      {/* Single tap toggles chrome; hold plays at 2x until release */}
      {media && !error ? (
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={onVideoGrant}
          onResponderRelease={onVideoRelease}
          onResponderTerminate={endHold}
          onResponderTerminationRequest={() => true}
        />
      ) : null}

      {controlsVisible && !immersive ? (
        <View style={[styles.topBar, { paddingTop: insets.top + spacing.xs }]} pointerEvents="box-none">
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {displayTitle}
          </Text>
        </View>
      ) : null}

      {showSpeedBadge ? (
        <View style={styles.speedBadge} pointerEvents="none">
          <Text style={styles.speedBadgeText}>2×</Text>
        </View>
      ) : null}

      {audioPickerOpen ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            setAudioPickerOpen(false);
            bumpChrome();
          }}
        />
      ) : null}
      {audioPickerOpen && media && !error ? (
        <View style={[styles.audioPicker, { bottom: insets.bottom + 110 }]}>
          <Text style={styles.audioPickerTitle}>Audio track</Text>
          {player.availableAudioTracks.map((t, i) => (
            <Pressable
              key={t.id ?? i}
              onPress={() => {
                player.audioTrack = t;
                setAudioPickerOpen(false);
                bumpChrome();
              }}
              style={[styles.audioOption, player.audioTrack?.id === t.id && styles.audioOptionActive]}>
              <Text style={styles.audioOptionText}>{t.label || t.language || `Track ${i + 1}`}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {controlsVisible && media && !error ? (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.sm }]}>
          <View
            style={styles.seekHit}
            onLayout={(e) => (barWidthRef.current = e.nativeEvent.layout.width)}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={onSeekGrant}
            onResponderMove={onSeekMove}
            onResponderRelease={onSeekRelease}>
            <View style={styles.seekTrack}>
              <View style={[styles.seekFill, { width: `${durationSec > 0 ? Math.min(100, (positionSec / durationSec) * 100) : 0}%` }]} />
            </View>
          </View>
          <View style={styles.controlsRow}>
            <Pressable
              onPress={() => {
                bumpChrome();
                togglePlay();
              }}
              hitSlop={8}>
              <Text style={styles.controlIcon}>{playing ? '❚❚' : '▶'}</Text>
            </Pressable>
            <Text style={styles.timeText}>
              {clock(positionSec)} / {clock(durationSec)}
            </Text>
            <View style={styles.controlsRight}>
              <Pressable
                onPress={() => {
                  bumpChrome();
                  cycleSubtitle();
                }}
                hitSlop={8}
                style={styles.controlChip}>
                <Text style={styles.controlChipText}>{subtitleLabel}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  bumpChrome();
                  setAudioPickerOpen((o) => !o);
                }}
                hitSlop={8}
                style={styles.controlChip}>
                <Text style={styles.controlChipText}>{audioLabel}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  bumpChrome();
                  if (immersive) exitImmersive();
                  else enterImmersive();
                }}
                hitSlop={8}>
                <Text style={styles.controlIcon}>⛶</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {showNext ? (
        <View style={[styles.nextBar, { bottom: (controlsVisible ? 96 : 16) + insets.bottom + spacing.xl }]}>
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
  },
  back: {
    paddingVertical: spacing.xs,
  },
  backText: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  title: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '600',
    flex: 1,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  seekHit: {
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  seekTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  seekFill: {
    height: 4,
    backgroundColor: colors.accent,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  controlsRight: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  controlIcon: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '700',
  },
  controlChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  controlChipText: {
    color: colors.text,
    fontSize: font.caption,
    fontWeight: '700',
  },
  audioPicker: {
    position: 'absolute',
    right: spacing.md,
    minWidth: 160,
    maxWidth: 260,
    borderRadius: 8,
    backgroundColor: 'rgba(20,20,20,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingVertical: spacing.xs,
  },
  audioPickerTitle: {
    color: colors.textSecondary,
    fontSize: font.caption,
    fontWeight: '700',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    textTransform: 'uppercase',
  },
  audioOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  audioOptionActive: {
    backgroundColor: 'rgba(255,59,48,0.25)',
  },
  audioOptionText: {
    color: colors.text,
    fontSize: font.body,
  },
  speedBadge: {
    position: 'absolute',
    top: '45%',
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  speedBadgeText: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
  },
  timeText: {
    color: colors.textSecondary,
    fontSize: font.caption,
    fontVariant: ['tabular-nums'],
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
