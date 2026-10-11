import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import * as Brightness from 'expo-brightness';
import { LinearGradient } from 'expo-linear-gradient';
import * as NavigationBar from 'expo-navigation-bar';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getVolume, setVolume } from 'react-native-volume-manager';

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

const RATIOS = ['Fit', 'Fill', 'Stretch', '16:9', '4:3'] as const;
type RatioMode = (typeof RATIOS)[number];

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  return formatDuration(Math.round(seconds * 1000));
}

function remaining(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}h ${pad(m)}m ${pad(s)}s` : `${m}m ${pad(s)}s`;
}

export default function PlayerScreen() {
  const params = useLocalSearchParams<{ mediaId?: string; entryId?: string }>();
  const mediaId = Number(params.mediaId);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [media, setMedia] = useState<MediaInfo | null>(null);
  const [entry, setEntry] = useState<EntryMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNext, setShowNext] = useState<{ mediaId: number; episodeId: number; label: string } | null>(null);
  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [audioPickerOpen, setAudioPickerOpen] = useState(false);
  const [barHeight, setBarHeight] = useState(0);
  const [ratio, setRatio] = useState<RatioMode>('Fit');
  const [ratioFlash, setRatioFlash] = useState<RatioMode | null>(null);
  const ratioFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showSpeedBadge, setShowSpeedBadge] = useState(false);
  // Orientation/immersive toggle removed — player is always landscape
  // const [immersive, setImmersive] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [chromeNonce, setChromeNonce] = useState(0);
  const [seekFlash, setSeekFlash] = useState<'back' | 'forward' | null>(null);
  const [showRemaining, setShowRemaining] = useState(false);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActive = useRef(false);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapTimeRef = useRef(0);
  const seekFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Vertical swipe: left = brightness, right = volume
  const swipeRef = useRef({ active: false, startX: 0, startY: 0 });
  const volStartRef = useRef(0.5);
  const briStartRef = useRef(0.5);
  const [adjust, setAdjust] = useState<{ mode: 'volume' | 'brightness'; value: number } | null>(null);
  const adjustTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resumeRef = useRef(0);
  const seekedRef = useRef(false);
  const nextCheckedRef = useRef(false);
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
        label: `S${next.seasonNumber}E${next.episodeNumber}`,
      });
    }
  }, [entry]);

  useEventListener(player, 'statusChange', ({ status, error: playerError }) => {
    if (status === 'error') {
      const raw = playerError?.message ?? 'This file could not be played.';
      // Device lacks a decoder for the audio/video codec (e.g. EAC3/Dolby on many phones)
      const codecIssue = /decoder init failed|unsupported type|eac3|ac3|no decoder/i.test(raw);
      // MKV seek index (Cues) damaged — a seek lands on invalid EBML bytes mid-file
      const indexIssue = /varint length mask/i.test(raw);
      setError(
        codecIssue
          ? 'Your device cannot decode an audio/video codec in this file (often Dolby/EAC3). Try a different rip with AAC audio, or re-encode the file’s audio to AAC.'
          : indexIssue
            ? 'This file’s seek index is damaged, so skipping ahead failed. Try again from an earlier point, or re-mux the file (e.g. “ffmpeg -i in.mkv -c copy out.mkv”) to rebuild the index.'
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
    // Offer next episode in the last 3 minutes; retract if the user seeks back
    if (lastDurRef.current > 0) {
      const remaining = lastDurRef.current - currentTime;
      if (remaining <= 180 && remaining > 5 && !nextCheckedRef.current) {
        nextCheckedRef.current = true;
        loadNext();
      } else if (remaining > 180 && nextCheckedRef.current) {
        nextCheckedRef.current = false;
        setShowNext(null);
      }
    }
    const now = Date.now();
    if (now - lastSavedRef.current > 10000) {
      lastSavedRef.current = now;
      saveProgress(mediaId, currentTime * 1000, player.duration > 0 ? player.duration * 1000 : null).catch(() => undefined);
    }
  });

  useEventListener(player, 'playToEnd', () => {
    lastPosRef.current = lastDurRef.current;
    saveNow(true);
    if (!nextCheckedRef.current) {
      nextCheckedRef.current = true;
      loadNext();
    }
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

  useEffect(() => {
    getVolume()
      .then((r) => {
        if (typeof r?.volume === 'number') volStartRef.current = r.volume;
      })
      .catch(() => undefined);
    Brightness.getBrightnessAsync()
      .then((v) => {
        if (typeof v === 'number') briStartRef.current = v;
      })
      .catch(() => undefined);
  }, []);

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

  // One responder chain for all gestures:
  //  hold = 2x;  vertical swipe L/R = brightness/volume;  double-tap sides = ±10s;  single tap = chrome
  const onVideoGrant = useCallback(
    (e: GestureResponderEvent) => {
      swipeRef.current = { active: false, startX: e.nativeEvent.locationX, startY: e.nativeEvent.locationY };
      startHold();
    },
    [startHold],
  );

  const onVideoMove = useCallback(
    (e: GestureResponderEvent) => {
      const { active, startX, startY } = swipeRef.current;
      const dy = startY - e.nativeEvent.locationY; // up = positive
      if (!active) {
        if (Math.abs(dy) < 12) return;
        swipeRef.current.active = true;
        if (holdTimer.current) clearTimeout(holdTimer.current);
        endHold();
      }
      const delta = dy / Math.max(1, height);
      const leftSide = startX < width / 2;
      const base = leftSide ? briStartRef.current : volStartRef.current;
      const value = Math.min(1, Math.max(0, base + delta));
      setAdjust({ mode: leftSide ? 'brightness' : 'volume', value });
      if (leftSide) Brightness.setBrightnessAsync(value).catch(() => undefined);
      else setVolume(value, { type: 'music' }).catch(() => undefined);
    },
    [endHold, height, width],
  );

  const onVideoRelease = useCallback(
    (e: GestureResponderEvent) => {
      const wasSwipe = swipeRef.current.active;
      swipeRef.current.active = false;
      const wasHold = holdActive.current;
      endHold();
      if (wasSwipe) {
        // Linger the level indicator briefly, then refresh base values
        if (adjustTimer.current) clearTimeout(adjustTimer.current);
        adjustTimer.current = setTimeout(() => setAdjust(null), 700);
        bumpChrome();
        getVolume()
          .then((r) => {
            if (typeof r?.volume === 'number') volStartRef.current = r.volume;
          })
          .catch(() => undefined);
        Brightness.getBrightnessAsync()
          .then((v) => {
            if (typeof v === 'number') briStartRef.current = v;
          })
          .catch(() => undefined);
        return;
      }
      if (wasHold) return;
      const now = Date.now();
      if (now - lastTapTimeRef.current < 300) {
        // Double tap: seek by side of screen
        if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
        lastTapTimeRef.current = 0;
        const forward = e.nativeEvent.locationX >= width / 2;
        const dur = lastDurRef.current;
        let next = lastPosRef.current + (forward ? 10 : -10);
        if (next < 0) next = 0;
        if (dur > 0 && next > dur) next = dur;
        player.currentTime = next;
        lastPosRef.current = next;
        setPositionSec(next);
        setSeekFlash(forward ? 'forward' : 'back');
        if (seekFlashTimer.current) clearTimeout(seekFlashTimer.current);
        seekFlashTimer.current = setTimeout(() => setSeekFlash(null), 500);
        bumpChrome();
      } else {
        lastTapTimeRef.current = now;
        singleTapTimer.current = setTimeout(() => {
          singleTapTimer.current = null;
          lastTapTimeRef.current = 0;
          toggleChrome();
        }, 300);
      }
    },
    [bumpChrome, endHold, player, toggleChrome, width],
  );

  useEffect(() => {
    return () => {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
      if (seekFlashTimer.current) clearTimeout(seekFlashTimer.current);
      if (adjustTimer.current) clearTimeout(adjustTimer.current);
      if (ratioFlashTimer.current) clearTimeout(ratioFlashTimer.current);
    };
  }, []);

  // Orientation toggle removed — player is always landscape (see mount effect above)
  // const enterImmersive = useCallback(() => {
  //   setImmersive(true);
  // }, []);

  // const exitImmersive = useCallback(() => {
  //   setImmersive(false);
  // }, []);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => undefined);
    return () => {
      ScreenOrientation.unlockAsync().catch(() => undefined);
    };
  }, []);

  const isEpisode = entry?.kind === 'episode' && !!entry.seriesTitle;
  const titleMain = isEpisode ? (entry?.seriesTitle ?? '') : (media?.fileName ?? '');
  const titleSub = isEpisode ? `Season ${entry?.seasonNumber} · Episode ${entry?.episodeNumber}` : null;

  const subtitleLabel = player.subtitleTrack && player.subtitleTrack.id !== 'off' ? 'CC ON' : 'CC';
  const audioLabel = player.audioTrack
    ? ((val) => (val ? val.charAt(0).toUpperCase() + val.slice(1).toLowerCase() : 'Audio'))(
      player.audioTrack.language || player.audioTrack.label,
    )
    : 'Audio';

  const frameAR = ratio === '16:9' ? 16 / 9 : 4 / 3;
  const frameW = Math.min(width, height * frameAR);

  return (
    <View style={styles.container}>
      <StatusBar hidden={!controlsVisible} style="light" />
      {ratio === '16:9' || ratio === '4:3' ? (
        <View style={styles.ratioFrame}>
          <VideoView
            player={player}
            style={{ width: frameW, height: frameW / frameAR }}
            nativeControls={false}
            contentFit="cover"
            fullscreenOptions={{ enable: false }}
          />
        </View>
      ) : (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          nativeControls={false}
          contentFit={ratio === 'Fit' ? 'contain' : ratio === 'Fill' ? 'cover' : 'fill'}
          fullscreenOptions={{ enable: false }}
        />
      )}

      {/* Gestures: hold = 2x, swipe L/R = brightness/volume, double-tap = ±10s, tap = chrome */}
      {media && !error ? (
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={onVideoGrant}
          onResponderMove={onVideoMove}
          onResponderRelease={onVideoRelease}
          onResponderTerminate={endHold}
          onResponderTerminationRequest={() => true}
        />
      ) : null}

      {adjust ? (
        <View
          style={[styles.seekFlashBox, adjust.mode === 'brightness' ? styles.seekFlashLeft : styles.seekFlashRight]}
          pointerEvents="none">
          <Ionicons
            name={
              adjust.mode === 'brightness'
                ? 'sunny'
                : adjust.value <= 0
                  ? 'volume-mute'
                  : adjust.value < 0.5
                    ? 'volume-low'
                    : adjust.value < 0.85
                      ? 'volume-medium'
                      : 'volume-high'
            }
            size={40}
            color={colors.text}
            style={styles.seekFlashGlyph}
          />
          <Text style={styles.seekFlashText}>{Math.round(adjust.value * 100)}%</Text>
        </View>
      ) : null}

      {seekFlash ? (
        <View style={[styles.seekFlashBox, seekFlash === 'back' ? styles.seekFlashLeft : styles.seekFlashRight]} pointerEvents="none">
          <Ionicons
            name={seekFlash === 'forward' ? 'play-forward' : 'play-back'}
            size={44}
            color={colors.text}
            style={styles.seekFlashGlyph}
          />
          <Text style={styles.seekFlashText}>10s</Text>
        </View>
      ) : null}

      {controlsVisible && media && !error ? (
        <Pressable
          style={styles.centerPlay}
          onPress={() => {
            bumpChrome();
            togglePlay();
          }}
          hitSlop={8}>
          <Ionicons name={playing ? 'pause' : 'play'} size={34} color={colors.text} />
        </Pressable>
      ) : null}

      {controlsVisible ? (
        <View style={styles.topWrap} pointerEvents="box-none">
          <LinearGradient
            colors={['rgba(0,0,0,0.8)', 'transparent']}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View
            style={[
              styles.topBar,
              {
                paddingTop: insets.top + spacing.xs,
                paddingLeft: Math.max(spacing.md, insets.left),
                paddingRight: Math.max(spacing.md, insets.right),
              },
            ]}
            pointerEvents="box-none">
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </Pressable>
            <View style={styles.titleBlock}>
              <Text style={styles.title} numberOfLines={1}>
                {titleMain}
              </Text>
              {titleSub ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {titleSub}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      {showSpeedBadge ? (
        <View style={styles.speedBadge} pointerEvents="none">
          <Text style={styles.speedBadgeText}>2×</Text>
        </View>
      ) : null}

      {ratioFlash ? (
        <View style={styles.speedBadge} pointerEvents="none">
          <Text style={styles.speedBadgeText}>{ratioFlash}</Text>
        </View>
      ) : null}

      {controlsVisible && media && !error ? (
        <View
          style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.sm }]}
          onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}>
          {showNext ? (
            <View style={styles.nextRow}>
              <Pressable
                hitSlop={8}
                onPress={() => {
                  seekedRef.current = false;
                  resumeRef.current = 0;
                  nextCheckedRef.current = false;
                  setShowNext(null);
                  setMedia(null);
                  setEntry(null);
                  router.replace({
                    pathname: '/player',
                    params: { mediaId: String(showNext.mediaId), entryId: String(showNext.episodeId) },
                  } as never);
                }}
                style={styles.nextChip}>
                <Ionicons name="play-skip-forward" size={13} color="#000" />
                <Text style={styles.nextChipText}>{showNext.label}</Text>
              </Pressable>
            </View>
          ) : null}
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
              hitSlop={8}
              style={styles.barIconButton}>
              <Ionicons name={playing ? 'pause' : 'play'} size={24} color={colors.text} />
            </Pressable>
            <Pressable
              onPress={() => {
                bumpChrome();
                setShowRemaining((v) => !v);
              }}
              hitSlop={8}>
              <Text style={styles.timeText}>
                {showRemaining
                  ? `- ${remaining(Math.max(0, durationSec - positionSec))}`
                  : `${clock(positionSec)} / ${clock(durationSec)}`}
              </Text>
            </Pressable>
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
                  const next = RATIOS[(RATIOS.indexOf(ratio) + 1) % RATIOS.length];
                  setRatio(next);
                  setRatioFlash(next);
                  if (ratioFlashTimer.current) clearTimeout(ratioFlashTimer.current);
                  ratioFlashTimer.current = setTimeout(() => setRatioFlash(null), 1500);
                }}
                hitSlop={8}
                style={styles.controlChip}>
                <Text style={styles.controlChipText}>{ratio}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  bumpChrome();
                  setAudioPickerOpen((o) => !o);
                }}
                hitSlop={8}
                style={[styles.controlChip, { marginRight: spacing.xl }]}>
                <Text style={styles.controlChipText}>{audioLabel}</Text>
              </Pressable>
              {/* Player is always landscape now — orientation toggle removed
              <Pressable
                onPress={() => {
                  bumpChrome();
                  if (immersive) exitImmersive();
                  else enterImmersive();
                }}
                hitSlop={8}
                style={styles.barIconButton}>
                <Ionicons name={immersive ? 'contract' : 'expand'} size={22} color={colors.text} />
              </Pressable>
              */}
            </View>
          </View>
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
        <View style={[styles.audioPicker, { bottom: barHeight }]}>
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
  ratioFrame: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.lg, // extra room so the fade blends out smoothly
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: font.caption,
    marginTop: 1,
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
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
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
  centerPlay: {
    position: 'absolute',
    top: '50%',
    marginTop: -40,
    alignSelf: 'center',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPlayText: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
  barIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seekFlashBox: {
    position: 'absolute',
    top: '50%',
    marginTop: -40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  seekFlashLeft: {
    left: 60,
  },
  seekFlashRight: {
    right: 60,
  },
  seekFlashGlyph: {
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  seekFlashText: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  timeText: {
    color: colors.textSecondary,
    fontSize: font.caption,
    fontVariant: ['tabular-nums'],
  },
  nextRow: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  nextChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: spacing.md,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  nextChipText: {
    color: '#000',
    fontSize: font.caption,
    fontWeight: '800',
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
