import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Thumb } from '@/components/thumb';
import { listTvChannels, setTvFavorite, type TvChannel } from '@/features/tv/store';
import { colors, font, radius, spacing } from '@/theme/colors';

const LOGO = 56;
const UNGROUPED = 'Other Channels';

// Each section holds a single data element (the array of channels) so the
// SectionList renders exactly one card per category — matching Settings.
type TvSection = { title: string; data: TvChannel[][] };

function ChannelRow({
  channel,
  onPlay,
  onToggleFavorite,
  divider,
}: {
  channel: TvChannel;
  onPlay: (c: TvChannel) => void;
  onToggleFavorite: (c: TvChannel) => void;
  divider?: boolean;
}) {
  const saved = channel.favorite === 1;
  return (
    <>
      <Pressable
        onPress={() => onPlay(channel)}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceHover }]}>
        <Thumb
          posterUrl={channel.logoUrl}
          width={LOGO}
          height={LOGO}
          title={channel.name}
          borderRadius={radius.sm}
        />
        <View style={styles.rowBody}>
          <Text style={styles.rowLabel} numberOfLines={2}>
            {channel.name}
          </Text>
          {channel.groupName ? (
            <Text style={styles.rowHint} numberOfLines={1}>
              {channel.groupName}
            </Text>
          ) : null}
        </View>
        <Pressable hitSlop={8} onPress={() => onToggleFavorite(channel)} style={styles.favBtn}>
          <Ionicons
            name={saved ? 'heart' : 'heart-outline'}
            size={20}
            color={saved ? colors.accent : colors.textMuted}
          />
        </Pressable>
        <Ionicons name="play-circle-outline" size={22} color={colors.textMuted} />
      </Pressable>
      {divider ? <View style={styles.divider} /> : null}
    </>
  );
}

export default function TvScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [showSaved, setShowSaved] = useState(false);
  const [channels, setChannels] = useState<TvChannel[]>([]);

  useFocusEffect(
    useCallback(() => {
      listTvChannels()
        .then(setChannels)
        .catch((e) => console.warn('WatchNow: tv list failed', e));
    }, []),
  );

  const onToggleFavorite = useCallback((c: TvChannel) => {
    const next = c.favorite === 1 ? 0 : 1;
    setTvFavorite(c.streamUrl, next === 1)
      .then(() => {
        setChannels((prev) =>
          prev.map((x) => (x.streamUrl === c.streamUrl ? { ...x, favorite: next } : x)),
        );
      })
      .catch((e) => console.warn('WatchNow: toggle favorite failed', e));
  }, []);

  const sections = useMemo<TvSection[]>(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, TvChannel[]>();
    for (const c of channels) {
      if (showSaved && c.favorite !== 1) continue;
      if (
        q &&
        !c.name.toLowerCase().includes(q) &&
        !(c.groupName ?? '').toLowerCase().includes(q)
      ) {
        continue;
      }
      const key = c.groupName?.trim() || UNGROUPED;
      const arr = map.get(key);
      if (arr) arr.push(c);
      else map.set(key, [c]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([title, data]) => ({ title, data: [data] }));
  }, [channels, query, showSaved]);

  const onPlay = (c: TvChannel) =>
    router.push({
      pathname: '/tv-player',
      params: { stream: c.streamUrl, name: c.name },
    } as never);

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>TV</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => setShowSaved((s) => !s)} hitSlop={12} style={styles.addLink}>
            <Ionicons
              name={showSaved ? 'heart' : 'heart-outline'}
              size={22}
              color={showSaved ? colors.accent : colors.text}
            />
          </Pressable>
          <Pressable onPress={() => router.push('/tv-playlists')} hitSlop={12} style={styles.addLink}>
            <Ionicons name="add-circle-outline" size={22} color={colors.text} />
            <Text style={styles.addLinkText}>Playlists</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} style={{ marginRight: spacing.sm }} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search channels"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item, index) => `${item[0]?.id ?? 'cat'}-${item.length}-${index}`}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.xl + insets.bottom + 72,
        }}
        renderSectionHeader={({ section }) => (
          <Text style={styles.eyebrow}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <View style={styles.card}>
            {item.map((c, i) => (
              <ChannelRow
                key={c.id}
                channel={c}
                onPlay={onPlay}
                onToggleFavorite={onToggleFavorite}
                divider={i < item.length - 1}
              />
            ))}
          </View>
        )}
        SectionSeparatorComponent={() => null}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {showSaved
              ? 'No saved channels yet — tap the heart on a channel to save it'
              : query.trim()
                ? 'No matching channels'
                : 'No channels yet — tap Playlists above to add an M3U link'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  heading: {
    color: colors.text,
    fontSize: font.hero,
    fontWeight: '900',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  addLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  addLinkText: {
    color: colors.text,
    fontSize: font.caption,
    fontWeight: '700',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: font.body,
    padding: 0,
  },
  eyebrow: {
    color: colors.textSecondary,
    fontSize: font.caption,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '600',
  },
  rowHint: {
    color: colors.textMuted,
    fontSize: font.small,
  },
  favBtn: {
    padding: spacing.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.sm + LOGO + spacing.md,
  },
  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
    fontSize: font.body,
    paddingHorizontal: spacing.lg,
  },
});
