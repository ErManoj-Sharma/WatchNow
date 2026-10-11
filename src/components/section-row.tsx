import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Thumb } from '@/components/thumb';
import { colors, font, radius, spacing } from '@/theme/colors';

export type CardItem = {
  id: number;
  kind: 'movie' | 'series' | 'episode';
  title: string;
  subtitle?: string | null;
  mediaId?: number | null;
  thumbnailPath?: string | null;
  href: { pathname: string; params?: Record<string, string> };
};

export function PosterCard({ item, width = 112 }: { item: CardItem; width?: number }) {
  const height = Math.round(width * 1.5);
  return (
    <Pressable
      onPress={() => router.push(item.href as never)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}>
      <Thumb mediaId={item.mediaId} uri={item.thumbnailPath} width={width} height={height} title={item.title} />
      <Text style={styles.title} numberOfLines={2}>
        {item.title}
      </Text>
      {item.subtitle ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {item.subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function SectionRow({ title, items }: { title: string; items: CardItem[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map((item) => (
          <PosterCard key={`${item.kind}-${item.id}`} item={item} />
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
    width: 112,
    borderRadius: radius.md,
  },
  title: {
    color: colors.text,
    fontSize: font.caption,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: font.small,
    marginTop: 2,
  },
});
