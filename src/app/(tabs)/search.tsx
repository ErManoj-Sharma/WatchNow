import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Thumb } from '@/components/thumb';
import { searchLibrary, type SearchResult } from '@/db/repositories';
import { colors, font, radius, spacing } from '@/theme/colors';

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = query.trim();
      if (!trimmed) {
        setResults([]);
        return;
      }
      searchLibrary(trimmed)
        .then((rows) => setResults(rows))
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <Text style={styles.heading}>Search</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Movies, series, episodes, file names"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
      <FlatList
        data={results}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        ListEmptyComponent={
          query.trim() ? (
            <Text style={styles.empty}>No matches</Text>
          ) : (
            <Text style={styles.empty}>Type to search your library</Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceRaised }]}
            onPress={() => {
              if (item.kind === 'episode' && item.seriesId) {
                router.push({ pathname: '/series/[id]', params: { id: String(item.seriesId) } } as never);
              } else if (item.kind === 'series') {
                router.push({ pathname: '/series/[id]', params: { id: String(item.id) } } as never);
              } else {
                router.push({ pathname: '/movie/[id]', params: { id: String(item.id) } } as never);
              }
            }}>
            <Thumb
              mediaId={item.mediaId}
              uri={item.thumbnailPath}
              posterUrl={item.posterUrl}
              width={56}
              height={80}
              title={item.title}
            />
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.rowKind}>
                {item.kind === 'series' ? 'Series' : item.kind === 'episode' ? `Episode${item.subtitle ? ` · ${item.subtitle}` : ''}` : 'Movie'}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  heading: {
    color: colors.text,
    fontSize: font.hero,
    fontWeight: '900',
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: font.body,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  rowKind: {
    color: colors.textSecondary,
    fontSize: font.caption,
  },
  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
    fontSize: font.body,
  },
});
