import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { listReviewItems, saveOverride, type ReviewItem } from '@/db/repositories';
import { colors, font, radius, spacing } from '@/theme/colors';

function ReviewCard({ item, onSaved }: { item: ReviewItem; onSaved: () => void }) {
  const [title, setTitle] = useState(item.title);
  const [season, setSeason] = useState(item.seasonNumber?.toString() ?? '');
  const [episode, setEpisode] = useState(item.episodeNumber?.toString() ?? '');
  const isEpisode = item.kind === 'episode';

  const save = (payload: Parameters<typeof saveOverride>[0]) => {
    saveOverride(payload)
      .then(onSaved)
      .catch(() => Alert.alert('Error', 'Could not save correction.'));
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.kind}>{item.kind.toUpperCase()}</Text>
        <Text style={styles.path} numberOfLines={1}>
          {item.relativePath}
        </Text>
      </View>
      <Text style={styles.current}>Current: {item.title}</Text>
      <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholder="Corrected title" placeholderTextColor={colors.textMuted} />
      {isEpisode ? (
        <View style={styles.numberRow}>
          <TextInput
            value={season}
            onChangeText={setSeason}
            style={[styles.input, styles.numberInput]}
            placeholder="Season"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
          />
          <TextInput
            value={episode}
            onChangeText={setEpisode}
            style={[styles.input, styles.numberInput]}
            placeholder="Episode"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
          />
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button
          label="Save"
          onPress={() =>
            save({
              entryId: item.id,
              title: title.trim() || undefined,
              seasonNumber: season.trim() ? Number(season) : undefined,
              episodeNumber: episode.trim() ? Number(episode) : undefined,
            })
          }
          style={{ flex: 1 }}
        />
        <Button
          label="Exclude"
          variant="secondary"
          onPress={() => {
            Alert.alert('Exclude item?', 'This hides the item from your library after the next scan.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Exclude', style: 'destructive', onPress: () => save({ entryId: item.id, exclude: true }) },
            ]);
          }}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

export default function ReviewScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ReviewItem[] | null>(null);

  const reload = useCallback(() => {
    listReviewItems()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <Text style={styles.heading}>Classification Review</Text>
      <Text style={styles.subheading}>
        Items the scanner was unsure about. Correct them here — rescans keep your corrections.
      </Text>
      <FlatList
        data={items ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: spacing.xl, paddingHorizontal: spacing.md }}
        ListEmptyComponent={
          <Text style={styles.empty}>{items == null ? 'Loading…' : 'Nothing to review. Nice.'}</Text>
        }
        renderItem={({ item }) => <ReviewCard item={item} onSaved={reload} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  heading: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '900',
    paddingHorizontal: spacing.md,
  },
  subheading: {
    color: colors.textSecondary,
    fontSize: font.caption,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  cardHeader: {
    gap: 2,
  },
  kind: {
    color: colors.accentSoft,
    fontSize: font.small,
    fontWeight: '900',
  },
  path: {
    color: colors.textMuted,
    fontSize: font.small,
  },
  current: {
    color: colors.textSecondary,
    fontSize: font.caption,
  },
  input: {
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: font.body,
  },
  numberRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  numberInput: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
