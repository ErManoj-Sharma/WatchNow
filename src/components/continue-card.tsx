import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ProgressBar } from '@/components/progress-bar';
import { Thumb } from '@/components/thumb';
import type { ContinueItem } from '@/db/repositories';
import { colors, font, radius, spacing } from '@/theme/colors';
import { formatDuration } from '@/utils/format';

function ContinueCard({ item }: { item: ContinueItem }) {
  const total = item.durationMs ?? 0;
  const remaining = total > 0 ? Math.max(0, total - item.positionMs) : null;
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/player',
          params: { mediaId: String(item.mediaId), entryId: String(item.entryId) },
        } as never)
      }
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}>
      <View>
        <Thumb mediaId={item.mediaId} uri={item.thumbnailPath} posterUrl={item.posterUrl} width={224} height={126} title={item.displayTitle} />
        <View style={styles.progressOverlay}>
          <ProgressBar positionMs={item.positionMs} durationMs={item.durationMs} />
        </View>
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {item.displayTitle}
      </Text>
      {item.subtitle ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {item.subtitle}
        </Text>
      ) : (
        <Text style={styles.subtitle} numberOfLines={1}>
          {remaining != null ? `${formatDuration(remaining)} left` : ''}
        </Text>
      )}
    </Pressable>
  );
}

export function ContinueRow({ items }: { items: ContinueItem[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Continue Watching</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map((item) => (
          <ContinueCard key={item.mediaId} item={item} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: font.heading,
    fontWeight: '800',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  row: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  card: {
    width: 224,
    borderRadius: radius.md,
  },
  progressOverlay: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
  },
  title: {
    color: colors.text,
    fontSize: font.caption,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: font.small,
    marginTop: 2,
  },
});
