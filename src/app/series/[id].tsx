import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Thumb } from '@/components/thumb';
import { getSeries, toggleFavorite, type EpisodeRow, type SeasonRow } from '@/db/repositories';
import { ensureThumbnail } from '@/features/library/thumbnails';
import { colors, font, radius, spacing } from '@/theme/colors';
import { formatDuration } from '@/utils/format';

type SeriesData = NonNullable<Awaited<ReturnType<typeof getSeries>>>;

const THUMB_W = 124;
const THUMB_H = 70;

function EpisodeItem({ episode, onPress }: { episode: EpisodeRow; onPress: () => void }) {
  const watched = !!episode.completed;
  const resumable = episode.positionMs != null && episode.positionMs > 15000 && !watched;
  const fraction =
    episode.durationMs && episode.positionMs != null && episode.positionMs > 0
      ? Math.min(1, episode.positionMs / episode.durationMs)
      : 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.episode, pressed && { backgroundColor: colors.surfaceRaised }]}>
      <View style={styles.thumbWrap}>
        <Thumb
          mediaId={episode.mediaId}
          uri={episode.thumbnailPath}
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
          {episode.episodeNumber}. {episode.title}
        </Text>
        <Text style={[styles.episodeMeta, resumable && { color: colors.accentSoft, fontWeight: '700' }]}>
          {watched
            ? 'Watched'
            : resumable
              ? `Resume · ${formatDuration(episode.durationMs)}`
              : formatDuration(episode.durationMs) || 'Duration unknown'}
          {episode.versionCount > 1 ? `  •  ${episode.versionCount} versions` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

export default function SeriesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [data, setData] = useState<SeriesData | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const probedRef = useRef(false);
  const [scrollY] = useState(() => new Animated.Value(0));

  const reload = useCallback(async () => {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return;
    const result = await getSeries(numericId);
    setData(result);
    setSelectedSeason((prev) => {
      if (prev != null && result?.seasons.some((s) => s.id === prev)) return prev;
      return result?.seasons[0]?.id ?? null;
    });
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  useEffect(() => {
    if (!data || probedRef.current) return;
    const pending = data.episodes.filter((e) => e.durationMs == null);
    if (pending.length === 0) return;
    probedRef.current = true;
    let mounted = true;
    Promise.all(pending.map((e) => ensureThumbnail(e.mediaId))).then(() => {
      if (mounted) reload();
    });
    return () => {
      mounted = false;
    };
  }, [data, reload]);

  const seasons: SeasonRow[] = data?.seasons ?? [];
  const episodes = useMemo(() => {
    if (!data || selectedSeason == null) return [];
    const season = data.seasons.find((s) => s.id === selectedSeason);
    if (!season) return [];
    return data.episodes.filter((e) => e.seasonNumber === season.seasonNumber);
  }, [data, selectedSeason]);

  if (!data) return <View style={styles.container} />;

  const allEpisodes = data.episodes;
  const watchedCount = allEpisodes.filter((e) => e.completed).length;
  const resumeTarget =
    allEpisodes.find((e) => e.positionMs != null && e.positionMs > 15000 && !e.completed) ??
    allEpisodes.find((e) => !e.completed) ??
    allEpisodes[0];
  const isResume =
    !!resumeTarget && resumeTarget.positionMs != null && resumeTarget.positionMs > 15000 && !resumeTarget.completed;
  const resumeFraction =
    isResume && resumeTarget.durationMs && resumeTarget.positionMs != null
      ? Math.min(1, resumeTarget.positionMs / resumeTarget.durationMs)
      : 0;
  const overallFraction = allEpisodes.length ? watchedCount / allEpisodes.length : 0;

  const heroHeight = Math.round(Math.min(height * 0.46, width * 1.1));
  const heroScale = scrollY.interpolate({
    inputRange: [-heroHeight, 0],
    outputRange: [2, 1],
    extrapolateRight: 'clamp',
  });
  const heroTranslate = scrollY.interpolate({
    inputRange: [-heroHeight, 0, heroHeight],
    outputRange: [-heroHeight / 2, 0, heroHeight * 0.3],
    extrapolate: 'clamp',
  });

  const playEpisode = (e: EpisodeRow) =>
    router.push({
      pathname: '/player',
      params: { mediaId: String(e.mediaId), entryId: String(e.id) },
    } as never);

  const currentSeason = seasons.find((s) => s.id === selectedSeason);

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        contentContainerStyle={{ paddingBottom: spacing.xl + insets.bottom }}>
        {/* HERO */}
        <View style={{ height: heroHeight, overflow: 'hidden', backgroundColor: colors.surface }}>
          {resumeTarget ? (
            <Animated.View
              style={{
                height: heroHeight,
                transform: [{ translateY: heroTranslate }, { scale: heroScale }],
              }}>
              <Thumb
                mediaId={resumeTarget.mediaId}
                uri={resumeTarget.thumbnailPath}
                posterUrl={data.series.posterUrl}
                width={width}
                height={heroHeight}
                title={data.series.title}
                borderRadius={0}
              />
            </Animated.View>
          ) : null}
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
            {data.series.title}
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>SERIES</Text>
            </View>
            <Text style={styles.meta}>
              {seasons.length} {seasons.length === 1 ? 'season' : 'seasons'}  •  {allEpisodes.length} episodes
              {watchedCount > 0 ? `  •  ${watchedCount} watched` : ''}
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
                {isResume ? 'Resume' : 'Play'} · S{resumeTarget.seasonNumber}:E{resumeTarget.episodeNumber}
              </Text>
            </Pressable>
          ) : null}

          {isResume && resumeFraction > 0 ? (
            <View style={styles.resumeRow}>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${resumeFraction * 100}%` }]} />
              </View>
              <Text style={styles.resumeText} numberOfLines={1}>
                {resumeTarget.title}
              </Text>
            </View>
          ) : null}

          <View style={styles.actionsRow}>
            <ActionButton
              icon={data.series.isFavorite ? 'checkmark' : 'add'}
              label="My List"
              active={!!data.series.isFavorite}
              onPress={() => {
                toggleFavorite(data.series.id).then(() => reload());
              }}
            />
          </View>

          {/* OVERALL PROGRESS */}
          {allEpisodes.length > 0 ? (
            <View style={styles.overall}>
              <View style={styles.overallHead}>
                <Ionicons name="albums-outline" size={18} color={colors.accent} />
                <Text style={styles.overallText}>
                  {watchedCount} of {allEpisodes.length} episodes watched
                </Text>
                <Text style={styles.overallPct}>{Math.round(overallFraction * 100)}%</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${overallFraction * 100}%` }]} />
              </View>
            </View>
          ) : null}
        </View>

        {/* SEASONS */}
        {seasons.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.seasonRow}
            style={{ flexGrow: 0 }}>
            {seasons.map((season) => {
              const selected = season.id === selectedSeason;
              return (
                <Pressable
                  key={season.id}
                  onPress={() => setSelectedSeason(season.id)}
                  style={[styles.seasonPill, selected && styles.seasonPillActive]}>
                  <Text style={[styles.seasonPillText, selected && styles.seasonPillTextActive]}>
                    {season.title}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{currentSeason?.title ?? 'Episodes'}</Text>
          <Text style={styles.sectionCount}>{episodes.length} episodes</Text>
        </View>

        <View style={styles.episodeList}>
          {episodes.map((episode) => (
            <EpisodeItem key={episode.id} episode={episode} onPress={() => playEpisode(episode)} />
          ))}
        </View>
      </Animated.ScrollView>

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

function ActionButton({
  icon,
  label,
  onPress,
  active,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <Ionicons name={icon} size={26} color={active ? colors.accent : colors.text} />
      <Text style={[styles.actionLabel, active && { color: colors.accent }]}>{label}</Text>
    </Pressable>
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
    borderColor: colors.textSecondary,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: {
    color: colors.textSecondary,
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
  resumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  resumeText: {
    flexShrink: 1,
    maxWidth: '55%',
    color: colors.accentSoft,
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
  actionsRow: {
    flexDirection: 'row',
    gap: 28,
    paddingVertical: spacing.xs,
  },
  action: {
    alignItems: 'center',
    gap: 4,
    minWidth: 56,
  },
  actionLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
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
  seasonRow: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  seasonPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.surfaceRaised,
  },
  seasonPillActive: {
    backgroundColor: '#fff',
  },
  seasonPillText: {
    color: colors.textSecondary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  seasonPillTextActive: {
    color: '#000',
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