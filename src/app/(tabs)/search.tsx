import { BlurTargetView } from 'expo-blur';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Thumb } from '@/components/thumb';
import { searchLibrary, type SearchResult } from '@/db/repositories';
import { setBlurTarget } from '@/lib/blur';
import { colors, font, radius, spacing } from '@/theme/colors';

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const rootRef = useRef<View>(null);

  const sections = useMemo(() => {
    const groups = [
      { title: 'Movies', data: results.filter((r) => r.kind === 'movie') },
      { title: 'Shows', data: results.filter((r) => r.kind === 'series') },
      { title: 'Episodes', data: results.filter((r) => r.kind === 'episode') },
    ];
    return groups.filter((g) => g.data.length > 0);
  }, [results]);

  useFocusEffect(
    useCallback(() => {
      setBlurTarget(rootRef.current);
    }, []),
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = query.trim();
      if (!trimmed) {
        setResults([]);
        return;
      }
      searchLibrary(trimmed)
        .then((rows) => setResults(rows))
        .catch((e) => console.warn('WatchNow: search failed', e));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <BlurTargetView ref={rootRef} style={styles.container}>
      <View style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.background }}>
        <Text style={styles.heading}>Search</Text>
      </View>
      <View style={{ flex: 1, paddingHorizontal: spacing.md }}>
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
      {query.trim() ? (
        <Text style={styles.count}>
          {results.length} {results.length === 1 ? 'result' : 'results'}
        </Text>
      ) : null}
      <SectionList
        sections={sections}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: spacing.xl + 72 }}
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
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
              if (item.kind === 'episode') {
                if (item.mediaId) {
                  router.push({
                    pathname: '/player',
                    params: { mediaId: String(item.mediaId), entryId: String(item.id) },
                  } as never);
                } else if (item.seriesId) {
                  router.push({ pathname: '/series/[id]', params: { id: String(item.seriesId) } } as never);
                }
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
              {item.kind === 'episode' ? (
                <Text style={styles.rowKind}>{`S${item.seasonNumber} E${item.episodeNumber} · ${item.subtitle ?? ''}`}</Text>
              ) : null}
            </View>
          </Pressable>
        )}
      />
      </View>
    </BlurTargetView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  count: {
    color: colors.textSecondary,
    fontSize: font.caption,
    marginBottom: spacing.sm,
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
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: font.caption,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
    fontSize: font.body,
  },
});
