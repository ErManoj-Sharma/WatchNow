import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ProgressBar } from '@/components/progress-bar';
import { Thumb } from '@/components/thumb';
import { getSeries, toggleFavorite, type EpisodeRow, type SeasonRow } from '@/db/repositories';
import { ensureThumbnail } from '@/features/library/thumbnails';
import { colors, font, radius, spacing } from '@/theme/colors';
import { formatDuration } from '@/utils/format';

type SeriesData = NonNullable<Awaited<ReturnType<typeof getSeries>>>;

function EpisodeItem({ episode, onPress }: { episode: EpisodeRow; onPress: () => void }) {
  const watched = !!episode.completed;
  const resumable = episode.positionMs != null && episode.positionMs > 15000 && !watched;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.episode, pressed && { backgroundColor: colors.surfaceRaised }]}>
      <Thumb mediaId={episode.mediaId} uri={episode.thumbnailPath} width={128} height={72} title={episode.title} />
      <View style={styles.episodeBody}>
        <Text style={styles.episodeTitle} numberOfLines={2}>
          {episode.episodeNumber}. {episode.title}
        </Text>
        <Text style={styles.episodeMeta}>
          {watched ? '✓ Watched' : resumable ? `Resume · ${formatDuration(episode.durationMs)}` : formatDuration(episode.durationMs) || 'Duration unknown'}
          {episode.versionCount > 1 ? ` · ${episode.versionCount} versions` : ''}
        </Text>
        {!watched ? <ProgressBar positionMs={episode.positionMs} durationMs={episode.durationMs} /> : null}
      </View>
    </Pressable>
  );
}

export default function SeriesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<SeriesData | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const probedRef = useRef(false);

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
  const resumeTarget =
    allEpisodes.find((e) => e.positionMs != null && e.positionMs > 15000 && !e.completed) ??
    allEpisodes.find((e) => !e.completed) ??
    allEpisodes[0];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: spacing.xl }}>
      <View style={styles.header}>
        <Text style={styles.title}>{data.series.title}</Text>
        <Text style={styles.meta}>
          {seasons.length} {seasons.length === 1 ? 'season' : 'seasons'} · {allEpisodes.length} episodes
        </Text>
      </View>

      <View style={styles.actions}>
        {resumeTarget ? (
          <Button
            label={
              resumeTarget.positionMs != null && resumeTarget.positionMs > 15000 && !resumeTarget.completed
                ? `Resume · S${resumeTarget.seasonNumber}E${resumeTarget.episodeNumber}`
                : `Play · S${resumeTarget.seasonNumber}E${resumeTarget.episodeNumber}`
            }
            onPress={() =>
              router.push({
                pathname: '/player',
                params: { mediaId: String(resumeTarget.mediaId), entryId: String(resumeTarget.id) },
              } as never)
            }
          />
        ) : null}
        <Button
          label={data.series.isFavorite ? '✓ In My List' : '+ My List'}
          variant="secondary"
          onPress={() => {
            toggleFavorite(data.series.id).then(() => reload());
          }}
        />
      </View>

      {seasons.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.seasonRow}>
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
      ) : (
        <Text style={styles.seasonHeader}>{seasons[0]?.title ?? 'Episodes'}</Text>
      )}

      <View style={styles.episodeList}>
        {episodes.map((episode) => (
          <EpisodeItem
            key={episode.id}
            episode={episode}
            onPress={() =>
              router.push({
                pathname: '/player',
                params: { mediaId: String(episode.mediaId), entryId: String(episode.id) },
              } as never)
            }
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: font.hero,
    fontWeight: '900',
  },
  meta: {
    color: colors.textSecondary,
    fontSize: font.caption,
    marginTop: 2,
  },
  actions: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  seasonRow: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  seasonPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceRaised,
  },
  seasonPillActive: {
    backgroundColor: colors.accent,
  },
  seasonPillText: {
    color: colors.textSecondary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  seasonPillTextActive: {
    color: colors.text,
  },
  seasonHeader: {
    color: colors.text,
    fontSize: font.heading,
    fontWeight: '800',
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
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
});
