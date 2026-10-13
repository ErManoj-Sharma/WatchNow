import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Thumb } from '@/components/thumb';
import { fetchPlaylistWithItems } from '@/features/youtube/api';
import {
  getPlaylist,
  getPlaylistVideos,
  savePlaylist,
  type YoutubePlaylist,
  type YoutubeVideo,
} from '@/features/youtube/store';
import { colors, font, radius, spacing } from '@/theme/colors';
import { formatDuration } from '@/utils/format';

const THUMB_W = 124;
const THUMB_H = 70;

function EpisodeItem({ episode, onPress }: { episode: YoutubeVideo; onPress: () => void }) {
  const watched = !!episode.completed;
  const durationMs = episode.durationSeconds != null ? episode.durationSeconds * 1000 : null;
  const resumable = episode.positionMs != null && episode.positionMs > 15000 && !watched;
  const fraction =
    durationMs && episode.positionMs != null && episode.positionMs > 0
      ? Math.min(1, episode.positionMs / durationMs)
      : 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.episode, pressed && { backgroundColor: colors.surfaceRaised }]}>
      <View style={styles.thumbWrap}>
        <Thumb
          posterUrl={episode.thumbnailUrl}
          width={THUMB_W}
          height={THUMB_H}
          title={episode.title}
        />
        <View style={styles.playOverlay} pointerEvents="none">
          <View style={styles.playCircle}>
            <Ionicons name="play" size={14} color="#fff" />
          </View>
        </View>
        {watched ? (
          <View style={styles.watchedBadge} pointerEvents="none">
            <Ionicons name="checkmark" size={12} color="#000" />
          </View>
        ) : null}
        {!watched && fraction > 0 ? (
          <View style={styles.thumbTrack} pointerEvents="none">
            <View style={[styles.thumbFill, { width: `${fraction * 100}%` }]} />
          </View>
        ) : null}
      </View>

      <View style={styles.episodeBody}>
        <Text style={styles.episodeTitle} numberOfLines={2}>
          {episode.position + 1}. {episode.title}
        </Text>
        <Text style={[styles.episodeMeta, resumable && { color: colors.accentSoft, fontWeight: '700' }]}>
          {watched
            ? 'Watched'
            : resumable
              ? `Resume · ${formatDuration(durationMs)}`
              : formatDuration(durationMs) || 'Duration unknown'}
        </Text>
      </View>
    </Pressable>
  );
}

export default function YoutubePlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [playlist, setPlaylist] = useState<YoutubePlaylist | null>(null);
  const [videos, setVideos] = useState<YoutubeVideo[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return;
    const [p, v] = await Promise.all([getPlaylist(numericId), getPlaylistVideos(numericId)]);
    setPlaylist(p);
    setVideos(v);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const refreshPlaylist = async () => {
    if (refreshing || !playlist) return;
    setRefreshing(true);
    try {
      const { meta, items } = await fetchPlaylistWithItems(playlist.playlistId);
      await savePlaylist(meta, playlist.url, items);
      await reload();
    } catch (err) {
      Alert.alert('Refresh failed', err instanceof Error ? err.message : 'Could not refresh this playlist.');
    } finally {
      setRefreshing(false);
    }
  };

  if (!playlist) return <View style={styles.container} />;

  const watchedCount = videos.filter((v) => v.completed).length;
  const resumeTarget =
    videos.find((v) => v.positionMs != null && v.positionMs > 15000 && !v.completed) ??
    videos.find((v) => !v.completed) ??
    videos[0];
  const isResume =
    !!resumeTarget &&
    resumeTarget.positionMs != null &&
    resumeTarget.positionMs > 15000 &&
    !resumeTarget.completed;
  const overallFraction = videos.length ? watchedCount / videos.length : 0;
  const heroHeight = Math.round(Math.min(width * 0.56, 280));

  const playEpisode = (v: YoutubeVideo) =>
    router.push({
      pathname: '/youtube-player',
      params: { playlistId: String(playlist.id), videoId: String(v.id) },
    } as never);

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xl + insets.bottom }}>
        {/* HERO */}
        <View style={{ height: heroHeight, overflow: 'hidden', backgroundColor: colors.surface }}>
          <Thumb
            posterUrl={playlist.thumbnailUrl}
            width={width}
            height={heroHeight}
            title={playlist.title}
            borderRadius={0}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.65)', 'transparent', colors.background]}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </View>

        {/* TITLE BLOCK */}
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={3}>
            {playlist.title}
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>YOUTUBE</Text>
            </View>
            <Text style={styles.meta}>
              {videos.length} {videos.length === 1 ? 'video' : 'videos'}
              {playlist.channelTitle ? `  ·  ${playlist.channelTitle}` : ''}
              {watchedCount > 0 ? `  ·  ${watchedCount} watched` : ''}
            </Text>
          </View>
        </View>

        {/* ACTIONS */}
        <View style={styles.actions}>
          {resumeTarget ? (
            <Pressable
              onPress={() => playEpisode(resumeTarget)}
              style={({ pressed }) => [styles.playBtn, pressed && styles.pressed]}>
              <Ionicons name="play" size={22} color="#000" />
              <Text style={styles.playText}>
                {isResume ? 'Resume' : 'Play'} · #{resumeTarget.position + 1}
              </Text>
            </Pressable>
          ) : null}

          {videos.length > 0 ? (
            <View style={styles.overall}>
              <View style={styles.overallHead}>
                <Ionicons name="logo-youtube" size={18} color={colors.accent} />
                <Text style={styles.overallText}>
                  {watchedCount} of {videos.length} watched
                </Text>
                <Text style={styles.overallPct}>{Math.round(overallFraction * 100)}%</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${overallFraction * 100}%` }]} />
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Episodes</Text>
          <View style={styles.sectionTools}>
            <Text style={styles.sectionCount}>{videos.length} videos</Text>
            <Pressable
              onPress={() => void refreshPlaylist()}
              hitSlop={8}
              disabled={refreshing}
              style={({ pressed }) => [styles.toolBtn, pressed && styles.pressed]}>
              {refreshing ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <Ionicons name="refresh-outline" size={18} color={colors.text} />
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.episodeList}>
          {videos.map((video) => (
            <EpisodeItem key={video.id} episode={video} onPress={() => playEpisode(video)} />
          ))}
        </View>
      </ScrollView>

      {/* BACK BUTTON */}
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={[styles.back, { top: insets.top + spacing.xs }]}>
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  titleBlock: {
    paddingHorizontal: spacing.md,
    marginTop: -spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: font.hero,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    flexWrap: 'wrap',
  },
  meta: {
    color: colors.textSecondary,
    fontSize: font.caption,
  },
  badge: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  actions: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: '#fff',
    borderRadius: 8,
    height: 48,
  },
  playText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.7,
  },
  overall: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  overallHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  overallText: {
    flex: 1,
    color: colors.text,
    fontSize: font.caption,
    fontWeight: '700',
  },
  overallPct: {
    color: colors.textSecondary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  track: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.progressTrack,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: font.heading,
    fontWeight: '800',
  },
  sectionCount: {
    color: colors.textSecondary,
    fontSize: font.caption,
  },
  sectionTools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  episodeList: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  episode: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  thumbWrap: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: 8,
    overflow: 'hidden',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: colors.progressTrack,
  },
  thumbFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  episodeBody: {
    flex: 1,
    gap: 4,
  },
  episodeTitle: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  episodeMeta: {
    color: colors.textSecondary,
    fontSize: font.small,
  },
  back: {
    position: 'absolute',
    left: spacing.sm,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
