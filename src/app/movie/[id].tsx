import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Row } from '@/components/progress-bar';
import { Thumb } from '@/components/thumb';
import { getMovie, toggleFavorite, type MovieDetail } from '@/db/repositories';
import { qualityOf } from '@/features/classification/parse';
import { ensureThumbnail } from '@/features/library/thumbnails';
import { colors, font, radius, spacing } from '@/theme/colors';
import { formatBytes, formatDuration } from '@/utils/format';

export default function MovieScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const probedRef = useRef(false);
  const [scrollY] = useState(() => new Animated.Value(0));

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
  const watched =
    movie.durationMs && movie.positionMs != null && movie.positionMs > 0
      ? Math.min(1, movie.positionMs / movie.durationMs)
      : movie.completed
        ? 1
        : 0;
  const resume = movie.positionMs != null && movie.positionMs > 15000 && !movie.completed;
  const remaining =
    resume && movie.durationMs && movie.positionMs != null
      ? formatDuration(Math.max(0, movie.durationMs - movie.positionMs))
      : null;
  // Poster-style hero: ~58% of the screen height (capped at a 2:3 poster ratio)
  const heroHeight = Math.round(Math.min(height * 0.58, width * 1.5));

  // Pull-down stretch effect + parallax on scroll
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

  const play = () =>
    router.push({
      pathname: '/player',
      params: { mediaId: String(movie.mediaItemId), entryId: String(movie.id) },
    } as never);

  // Meta line: "1h 52m  •  1080p  •  Local file"
  const metaParts = [
    movie.durationMs ? formatDuration(movie.durationMs) : null,
    quality || null,
    'Local file',
  ].filter(Boolean) as string[];

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
        <View style={{ height: heroHeight, overflow: 'hidden' }}>
          <Animated.View
            style={{
              height: heroHeight,
              transform: [{ translateY: heroTranslate }, { scale: heroScale }],
            }}>
            <Thumb
              mediaId={movie.mediaItemId}
              uri={movie.thumbnailPath}
              posterUrl={movie.posterUrl}
              width={width}
              height={heroHeight}
              title={movie.title}
              borderRadius={0}
            />
          </Animated.View>
          <LinearGradient
            colors={['rgba(0,0,0,0.65)', 'transparent', colors.background]}
            locations={[0, 0.6, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </View>

        {/* TITLE BLOCK — overlaps the hero's fade */}
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={3}>
            {movie.title}
          </Text>
          <View style={styles.metaRow}>
            {quality ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{quality}</Text>
              </View>
            ) : null}
            <Text style={styles.meta}>
              {metaParts.filter((p) => p !== quality).join('  •  ')}
            </Text>
          </View>
        </View>

        {/* ACTIONS */}
        <View style={styles.body}>
          <Pressable
            onPress={play}
            style={({ pressed }) => [styles.playBtn, pressed && styles.pressed]}>
            <Ionicons name="play" size={22} color="#000" />
            <Text style={styles.playText}>{resume ? 'Resume' : 'Play'}</Text>
          </Pressable>

          {resume && watched > 0 ? (
            <View style={styles.resumeRow}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${watched * 100}%` }]} />
              </View>
              <Text style={styles.resumeText}>{remaining} left</Text>
            </View>
          ) : null}

          <View style={styles.actionsRow}>
            <ActionButton
              icon={movie.isFavorite ? 'checkmark' : 'add'}
              label="My List"
              active={!!movie.isFavorite}
              onPress={() => {
                toggleFavorite(movie.id).then(() => reload());
              }}
            />
            {movie.needsReview ? (
              <ActionButton
                icon="alert-circle-outline"
                label="Review"
                onPress={() => router.push('/review')}
              />
            ) : null}
            <ActionButton
              icon={showInfo ? 'information-circle' : 'information-circle-outline'}
              label="Info"
              active={showInfo}
              onPress={() => setShowInfo((v) => !v)}
            />
          </View>

          {/* QUICK STATS */}
          <View style={styles.statsRow}>
            <Stat icon="time-outline" label={formatDuration(movie.durationMs) || 'Unknown'} />
            <Stat icon="film-outline" label={quality || 'Unknown'} />
            <Stat icon="save-outline" label={formatBytes(movie.sizeBytes) || '—'} />
          </View>

          {/* YOUR PROGRESS */}
          <View style={extra.section}>
            <Text style={extra.sectionTitle}>Your progress</Text>
            <View style={extra.progressCard}>
              <View style={extra.progressHead}>
                <Ionicons
                  name={movie.completed ? 'checkmark-circle' : resume ? 'play-circle' : 'ellipse-outline'}
                  size={22}
                  color={movie.completed || resume ? colors.accent : colors.textSecondary}
                />
                <Text style={extra.progressStatus}>
                  {movie.completed
                    ? 'Watched'
                    : resume
                      ? `${formatDuration(movie.positionMs)} of ${formatDuration(movie.durationMs) || '—'}`
                      : 'Not started yet'}
                </Text>
                <Text style={extra.progressPct}>{Math.round(watched * 100)}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${watched * 100}%` }]} />
              </View>
            </View>
          </View>

          {/* DETAILS GRID */}
          <View style={extra.section}>
            <Text style={extra.sectionTitle}>Details</Text>
            <View style={extra.grid}>
              <Tile icon="time-outline" label="Duration" value={formatDuration(movie.durationMs) || 'Unknown'} />
              <Tile icon="film-outline" label="Quality" value={quality || 'Unknown'} />
              <Tile icon="save-outline" label="File size" value={formatBytes(movie.sizeBytes) || '—'} />
              <Tile
                icon="sparkles-outline"
                label="Match"
                value={`${(movie.confidence * 100).toFixed(0)}% · ${movie.classificationSource}`}
              />
            </View>
            <View style={extra.pathCard}>
              <Ionicons name="folder-open-outline" size={20} color={colors.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={extra.tileLabel}>Location</Text>
                <Text style={extra.pathText} numberOfLines={2}>
                  {movie.relativePath}
                </Text>
              </View>
            </View>
          </View>

          {/* FILE INFO (collapsible) */}
          {showInfo ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>File information</Text>
              <Row label="File name" value={movie.fileName} />
              <Row label="Size" value={formatBytes(movie.sizeBytes) || '—'} />
              <Row label="Duration" value={formatDuration(movie.durationMs) || 'Unknown'} />
              <Row label="Quality" value={quality || 'Unknown'} />
              <Row label="Path" value={movie.relativePath} />
              <Row
                label="Classification"
                value={`${movie.classificationSource} · confidence ${(movie.confidence * 100).toFixed(0)}%`}
              />
            </View>
          ) : null}
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

const extra = StyleSheet.create({
  section: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: font.heading,
    fontWeight: '800',
  },
  progressCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  progressHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  progressStatus: {
    flex: 1,
    color: colors.text,
    fontSize: font.caption,
    fontWeight: '700',
  },
  progressPct: {
    color: colors.textSecondary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    width: '48.5%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 6,
  },
  tileLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  tileValue: {
    color: colors.text,
    fontSize: font.caption,
    fontWeight: '800',
  },
  pathCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  pathText: {
    color: colors.text,
    fontSize: font.caption,
    marginTop: 2,
  },
});

function Tile({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={extra.tile}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <Text style={extra.tileLabel}>{label}</Text>
      <Text style={extra.tileValue} numberOfLines={2}>
        {value}
      </Text>
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

function Stat({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={16} color={colors.textSecondary} />
      <Text style={styles.statText} numberOfLines={1}>
        {label}
      </Text>
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
    borderColor: colors.textSecondary,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  body: {
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
    fontSize: 17,
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
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.progressTrack,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  resumeText: {
    color: colors.accentSoft,
    fontSize: font.caption,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.lg ?? 28,
    paddingVertical: spacing.sm,
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
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  statText: {
    color: colors.text,
    fontSize: font.caption,
    fontWeight: '600',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  cardTitle: {
    color: colors.text,
    fontSize: font.heading,
    fontWeight: '800',
    marginBottom: spacing.xs,
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