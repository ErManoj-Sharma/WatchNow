import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Row } from '@/components/progress-bar';
import { Thumb } from '@/components/thumb';
import { getMovie, toggleFavorite, type MovieDetail } from '@/db/repositories';
import { ensureThumbnail } from '@/features/library/thumbnails';
import { colors, font, radius, spacing } from '@/theme/colors';
import { formatBytes, formatDuration } from '@/utils/format';
import { qualityOf } from '@/features/classification/parse';

export default function MovieScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const probedRef = useRef(false);

  const reload = useCallback(async () => {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return;
    setMovie(await getMovie(numericId));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  useEffect(() => {
    if (!movie || probedRef.current || movie.durationMs != null) return;
    probedRef.current = true;
    let mounted = true;
    ensureThumbnail(movie.mediaItemId).then(() => {
      if (mounted) reload();
    });
    return () => {
      mounted = false;
    };
  }, [movie, reload]);

  if (!movie) {
    return <View style={styles.container} />;
  }

  const quality = qualityOf(movie.fileName, movie.relativePath);
  const resume = movie.positionMs != null && movie.positionMs > 15000 && !movie.completed;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: spacing.xl }}>
      <View style={styles.heroWrap}>
        <Thumb
          mediaId={movie.mediaItemId}
          uri={movie.thumbnailPath}
          posterUrl={movie.posterUrl}
          width={400}
          height={230}
          title={movie.title}
          borderRadius={0}
        />
        <View style={[styles.heroGradient, { height: 120 }]} pointerEvents="none" />
        <View style={[styles.heroBottom, { bottom: 0 }]}>
          <Text style={styles.title}>{movie.title}</Text>
          <View style={styles.metaRow}>
            {movie.durationMs ? <Text style={styles.meta}>{formatDuration(movie.durationMs)}</Text> : null}
            {quality ? <Text style={styles.badge}>{quality}</Text> : null}
            <Text style={styles.meta}>Local file</Text>
          </View>
        </View>
      </View>

      <View style={styles.body}>
        <Button
          label={resume ? `Resume from ${formatDuration(movie.positionMs)}` : 'Play'}
          onPress={() =>
            router.push({
              pathname: '/player',
              params: { mediaId: String(movie.mediaItemId), entryId: String(movie.id) },
            } as never)
          }
        />
        <Button
          label={movie.isFavorite ? '✓ In My List' : '+ My List'}
          variant="secondary"
          onPress={() => {
            toggleFavorite(movie.id).then(() => reload());
          }}
        />

        {movie.needsReview ? <Button label="Review classification" variant="ghost" onPress={() => router.push('/review')} /> : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>File information</Text>
          <Row label="File name" value={movie.fileName} />
          <Row label="Size" value={formatBytes(movie.sizeBytes) || '—'} />
          <Row label="Duration" value={formatDuration(movie.durationMs) || 'Unknown'} />
          <Row label="Quality" value={quality || 'Unknown'} />
          <Row label="Path" value={movie.relativePath} />
          <Row label="Classification" value={`${movie.classificationSource} · confidence ${(movie.confidence * 100).toFixed(0)}%`} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  heroWrap: {
    position: 'relative',
    alignItems: 'center',
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 110,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  heroBottom: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: font.hero,
    fontWeight: '900',
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  meta: {
    color: colors.textSecondary,
    fontSize: font.caption,
  },
  badge: {
    color: colors.text,
    fontSize: font.small,
    fontWeight: '800',
    backgroundColor: colors.surfaceHover,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  body: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  cardTitle: {
    color: colors.text,
    fontSize: font.heading,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
});
