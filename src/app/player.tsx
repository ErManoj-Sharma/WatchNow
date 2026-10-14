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
import { VlcVideoView, type VlcVideoViewHandle } from '../../modules/vlc-player/src/VlcPlayerView';

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

// Step-by-step debug trail — view with: adb logcat -s ReactNativeJS VlcPlayer
const log = (...args: unknown[]) => console.log('[player]', ...args);

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
  const [vlcTracks, setVlcTracks] = useState<{ id: number; name: string; selected?: boolean }[]>([]);
  const [vlcSubId, setVlcSubId] = useState(-1); // libVLC: -1 = subtitles off
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

  // Dual-engine playback: expo-video is the default. On a codec error (e.g. EAC3/Dolby,
  // which many devices can't decode) we hand just that file to embedded libVLC, which
  // bundles its own decoders. Only broken files ever touch VLC.
  const [engine, setEngine] = useState<'expo' | 'vlc'>('expo');
  const engineRef = useRef<'expo' | 'vlc'>('expo');
  const vlcRef = useRef<VlcVideoViewHandle>(null);
  const vlcUriRef = useRef<string | null>(null);
  const vlcPlayingRef = useRef(false);
  const lastLoggedProgressRef = useRef(0);

  useEffect(() => {
    engineRef.current = engine;
    log('engine =', engine, '->', engine === 'vlc' ? 'VlcVideoView' : 'expo VideoView');
  }, [engine]);

  useEffect(() => {
    if (!Number.isFinite(mediaId)) return;
    let mounted = true;
    log('loading media', 'mediaId=', mediaId);
    Promise.all([getMedia(mediaId), getProgress(mediaId), entryForMedia(mediaId)])
      .then(([m, prog, e]) => {
        if (!mounted) return;
        setMedia(m);
        setEntry(e);
        if (prog && !prog.completed) resumeRef.current = prog.positionMs;
        if (m) {
          log('media loaded', 'uri=', m.documentUri, 'resumeMs=', resumeRef.current);
          player.replaceAsync(m.documentUri).catch((err) => {
            log('replaceAsync FAILED:', err instanceof Error ? err.message : String(err));
            setError('Could not load file');
          });
        } else setError('File not found');
      })
      .catch((err) => {
        log('media load FAILED:', err instanceof Error ? err.message : String(err));
        if (mounted) setError('Could not load file');
      });
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

  // Shared by expo-video's timeUpdate and libVLC's onProgress so both engines feed the
  // same position state, next-episode offer, and periodic progress save.
  const handleProgress = useCallback(
    (currentTime: number, duration: number) => {
      lastPosRef.current = currentTime;
      if (duration > 0) lastDurRef.current = duration;
      setPositionSec(currentTime);
      if (currentTime - lastLoggedProgressRef.current >= 5 || currentTime < lastLoggedProgressRef.current) {
        lastLoggedProgressRef.current = currentTime;
        log('progress', 'engine=', engineRef.current, 'pos=', currentTime.toFixed(1), 'dur=', lastDurRef.current.toFixed(1));
      }
      if (lastDurRef.current > 0) {
        const remainingSec = lastDurRef.current - currentTime;
        if (remainingSec <= 180 && remainingSec > 5 && !nextCheckedRef.current) {
          nextCheckedRef.current = true;
          loadNext();
        } else if (remainingSec > 180 && nextCheckedRef.current) {
          nextCheckedRef.current = false;
          setShowNext(null);
        }
      }
      const now = Date.now();
      if (now - lastSavedRef.current > 10000) {
        lastSavedRef.current = now;
        saveProgress(mediaId, currentTime * 1000, lastDurRef.current > 0 ? lastDurRef.current * 1000 : null).catch(() => undefined);
      }
    },
    [loadNext, mediaId],
  );

  // Shared end-of-media handling for both engines.
  const handleEnd = useCallback(() => {
    // useVideoPlayer(null) fires a phantom playToEnd at mount (dur=0) — ignoring it
    // prevents marking the file completed with position 0.
    if (lastDurRef.current <= 0) {
      log('ended ignored (duration not known yet)');
      return;
    }
    log('ended', 'engine=', engineRef.current, 'dur=', lastDurRef.current.toFixed(1));
    lastPosRef.current = lastDurRef.current;
    saveNow(true);
    if (!nextCheckedRef.current) {
      nextCheckedRef.current = true;
      loadNext();
    }
  }, [loadNext, saveNow]);

  // Hand the current file to libVLC (used when expo-video hits a codec error).
  const switchToVlc = useCallback((uri: string) => {
    log('switchToVlc', 'uri=', uri, 'resumeMs=', resumeRef.current);
    vlcUriRef.current = uri;
    setError(null);
    setVlcSubId(-1);
    setEngine('vlc');
  }, []);

  // Once the VLC view mounts, load the source. Prefer the live in-session position
  // (the user may have seeked since load) over the DB resume value.
  useEffect(() => {
    if (engine !== 'vlc' || !vlcUriRef.current) return;
    const uri = vlcUriRef.current;
    const startSeconds = lastPosRef.current > 0 ? lastPosRef.current : (resumeRef.current || 0) / 1000;
    const t = setTimeout(() => {
      log('vlc loadSource', 'uri=', uri, 'startSec=', startSeconds.toFixed(1));
      vlcRef.current?.loadSource(uri, startSeconds).catch((err) => {
        log('vlc loadSource FAILED:', err instanceof Error ? err.message : String(err));
        setError('Could not play this file');
      });
    }, 50);
    return () => clearTimeout(t);
  }, [engine]);

  useEventListener(player, 'statusChange', ({ status, error: playerError }) => {
    // After the VLC handoff the expo player object is still alive and keeps emitting;
    // its stale events must not stomp position/state owned by the VLC engine.
    if (engineRef.current !== 'expo') return;
    log('statusChange', 'status=', status, 'error=', playerError?.message ?? null);
    if (status === 'error') {
      const raw = playerError?.message ?? 'This file could not be played.';
      // Device lacks a decoder for the audio/video codec (e.g. EAC3/Dolby on many phones)
      const codecIssue = /decoder init failed|unsupported type|eac3|ac3|no decoder/i.test(raw);
      // Hand codec-unsupported files to libVLC, which bundles its own decoders.
      if (codecIssue && media?.documentUri && engineRef.current === 'expo') {
        log('codec error detected -> handing to VLC:', raw);
        switchToVlc(media.documentUri);
        return;
      }
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
      log('readyToPlay', 'duration=', player.duration, 'resumeSec=', (resumeRef.current / 1000).toFixed(1));
      if (player.duration > 0) {
        lastDurRef.current = player.duration;
        setDurationSec(player.duration);
        updateMediaDuration(mediaId, player.duration * 1000).catch(() => undefined);
      }
      if (resumeRef.current > 5) {
        player.currentTime = resumeRef.current / 1000;
      }
      // expo defaults to no audio track (silent playback); pick the first one.
      // Codec-unsupported tracks (e.g. EAC3) fall through to the VLC handoff below.
      const tracks = player.availableAudioTracks;
      if (tracks.length > 0 && !player.audioTrack) {
        player.audioTrack = tracks[0];
      }
      player.play();
      setPlaying(true);
    }
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (engineRef.current !== 'expo') return;
    handleProgress(currentTime, player.duration);
  });

  useEventListener(player, 'playToEnd', () => {
    if (engineRef.current !== 'expo') return;
    handleEnd();
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
    log('togglePlay', 'engine=', engineRef.current);
    if (engineRef.current === 'vlc') {
      if (vlcPlayingRef.current) {
        vlcRef.current?.pause();
        setPlaying(false);
      } else {
        vlcRef.current?.play();
        setPlaying(true);
      }
      return;
    }
    if (player.playing) {
      player.pause();
      setPlaying(false);
    } else {
      player.play();
      setPlaying(true);
    }
  }, [player]);

  const cycleSubtitle = useCallback(() => {
    if (engineRef.current === 'vlc') {
      // The expo player is dead after handoff — subtitle selection must go to VLC.
      vlcRef.current?.getSubtitleTracks().then((tracks) => {
        log('cycleSubtitle engine= vlc tracks=', JSON.stringify(tracks), 'current=', vlcSubId);
        if (tracks.length === 0) return;
        const idx = tracks.findIndex((t) => t.id === vlcSubId);
        // Tracks include a Disable entry (id -1); wrapping past the last real track turns subs off.
        const next = tracks[(idx + 1) % tracks.length];
        log('setSubtitleTrack engine= vlc to=', next.id, next.name);
        vlcRef.current?.setSubtitleTrack(next.id).catch(() => undefined);
        setVlcSubId(next.id);
      }).catch(() => undefined);
      return;
    }
    const tracks = player.availableSubtitleTracks;
    log('cycleSubtitle', 'engine=', engineRef.current, 'available=', tracks.length, 'current=', player.subtitleTrack?.id ?? 'off');
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
  }, [player, vlcSubId]);

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
      log('seek', 'engine=', engineRef.current, 'to=', dragRef.current.toFixed(1), 'dur=', lastDurRef.current.toFixed(1));
      if (engineRef.current === 'vlc') {
        const dur = lastDurRef.current;
        if (dur > 0) vlcRef.current?.seek(dragRef.current / dur);
      } else {
        player.currentTime = dragRef.current;
      }
      lastPosRef.current = dragRef.current;
    }
    dragRef.current = null;
  }, [player]);

  const startHold = useCallback(() => {
    holdTimer.current = setTimeout(() => {
      holdActive.current = true;
      if (engineRef.current === 'vlc') vlcRef.current?.setRate(2);
      else player.playbackRate = 2;
      setShowSpeedBadge(true);
    }, 250);
  }, [player]);

  const endHold = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (holdActive.current) {
      if (engineRef.current === 'vlc') vlcRef.current?.setRate(1);
      else player.playbackRate = 1;
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
        if (engineRef.current === 'vlc') {
          if (dur > 0) vlcRef.current?.seek(next / dur);
        } else {
          player.currentTime = next;
        }
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

  const subtitleLabel = engine === 'vlc'
    ? (vlcSubId !== -1 ? 'CC ON' : 'CC')
    : player.subtitleTrack && player.subtitleTrack.id !== 'off' ? 'CC ON' : 'CC';
  const audioLabel = engine === 'vlc'
    ? (vlcTracks.find((t) => t.selected)?.name ?? 'Audio')
    : player.audioTrack
      ? ((val) => (val ? val.charAt(0).toUpperCase() + val.slice(1).toLowerCase() : 'Audio'))(
        player.audioTrack.language || player.audioTrack.label,
      )
      : 'Audio';

  const frameAR = ratio === '16:9' ? 16 / 9 : 4 / 3;
  const frameW = Math.min(width, height * frameAR);

  // Events for the libVLC fallback surface; they feed the same state the expo path uses.
  const vlcEventProps = {
    onDuration: (sec: number) => {
      log('vlc onDuration', sec.toFixed(1));
      lastDurRef.current = sec;
      setDurationSec(sec);
    },
    onProgress: (sec: number) => handleProgress(sec, 0),
    onPlaying: () => {
      log('vlc onPlaying');
      vlcPlayingRef.current = true;
      setPlaying(true);
    },
    onPaused: () => {
      log('vlc onPaused');
      vlcPlayingRef.current = false;
      setPlaying(false);
    },
    onEnd: handleEnd,
    onError: (msg: string) => {
      log('vlc onError', msg);
      setError(`Playback failed: ${msg}`);
    },
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden={!controlsVisible} style="light" />
      {engine === 'vlc' ? (
        // Single persistent mount across ratio modes: the MediaPlayer lives inside the
        // native view — swapping branches would destroy it (cleanup on destroy) and the
        // freshly mounted view would sit empty with no way to reload.
        <View style={styles.ratioFrame}>
          <VlcVideoView
            ref={vlcRef}
            style={ratio === '16:9' || ratio === '4:3' ? { width: frameW, height: frameW / frameAR } : StyleSheet.absoluteFill}
            {...vlcEventProps}
          />
        </View>
      ) : ratio === '16:9' || ratio === '4:3' ? (
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
                  if (engineRef.current === 'vlc') {
                    vlcRef.current?.getAudioTracks().then((tracks) => {
                      log('audioPicker open engine= vlc tracks=', JSON.stringify(tracks));
                      setVlcTracks(tracks);
                      setAudioPickerOpen((o) => !o);
                    }).catch(() => undefined);
                  } else {
                    const tracks = player.availableAudioTracks;
                    log('audioPicker open', 'engine=', engineRef.current, 'tracks=', JSON.stringify(tracks.map((t) => ({ id: t.id, label: t.label, lang: t.language }))));
                    setAudioPickerOpen((o) => !o);
                  }
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
          {engine === 'vlc'
            ? vlcTracks.map((t, i) => (
              <Pressable
                key={t.id}
                onPress={() => {
                  log('setAudioTrack engine= vlc from=', vlcTracks.find((x) => x.selected)?.id ?? null, 'to=', t.id, t.name);
                  vlcRef.current?.setAudioTrack(t.id).catch(() => undefined);
                  setVlcTracks((list) => list.map((x) => ({ ...x, selected: x.id === t.id })));
                  setAudioPickerOpen(false);
                  bumpChrome();
                }}
                style={[styles.audioOption, t.selected && styles.audioOptionActive]}>
                <Text style={styles.audioOptionText}>{t.name || `Track ${i + 1}`}</Text>
              </Pressable>
            ))
            : player.availableAudioTracks.map((t, i) => (
              <Pressable
                key={t.id ?? i}
                onPress={() => {
                  log('setAudioTrack', 'engine=', engineRef.current, 'from=', player.audioTrack?.id ?? null, 'to=', t.id, t.label, t.language ?? '');
                  player.audioTrack = t;
                  log('setAudioTrack done, now=', player.audioTrack?.id ?? null);
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
