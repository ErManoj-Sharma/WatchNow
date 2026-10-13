import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { fetchTvPlaylist, hlsAsChannel } from '@/features/tv/api';
import { deleteTvPlaylist, listTvPlaylists, saveTvPlaylist, type TvPlaylist } from '@/features/tv/store';
import { colors, font, radius, spacing } from '@/theme/colors';

export default function TvPlaylistsScreen() {
  const insets = useSafeAreaInsets();
  const [playlists, setPlaylists] = useState<TvPlaylist[]>([]);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    listTvPlaylists().then(setPlaylists).catch(() => undefined);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const onAdd = useCallback(async () => {
    const link = url.trim();
    if (!link || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { name, content } = await fetchTvPlaylist(link);
      const channels = content.kind === 'channels' ? content.channels : hlsAsChannel(link, name);
      await saveTvPlaylist(link, name, channels);
      setUrl('');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that playlist.');
    } finally {
      setBusy(false);
    }
  }, [url, busy, reload]);

  const onDelete = useCallback(
    (p: TvPlaylist) => {
      Alert.alert('Remove playlist?', `"${p.name}" and its ${p.channelCount} channels will be removed.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            deleteTvPlaylist(p.id).then(reload);
          },
        },
      ]);
    },
    [reload],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.heading}>TV Playlists</Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.xl + insets.bottom,
        }}>
        <Text style={styles.hint}>
          Paste an M3U/M3U8 playlist link to add its channels to the TV tab. Channels stream over the
          internet and need a connection.
        </Text>

        <Text style={styles.fieldLabel}>Playlist URL</Text>
        <TextInput
          value={url}
          onChangeText={(t) => {
            setUrl(t);
            setError(null);
          }}
          placeholder="…/languages/hin.m3u or …/master.m3u8"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={{ marginTop: spacing.md }}>
          <Button label={busy ? 'Adding…' : 'Add playlist'} onPress={onAdd} disabled={busy || !url.trim()} />
        </View>

        <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>
          {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'} added
        </Text>
        {playlists.length === 0 ? (
          <Text style={styles.empty}>No playlists yet.</Text>
        ) : (
          playlists.map((p) => (
            <View key={p.id} style={styles.row}>
              <View style={styles.rowMain}>
                <View style={styles.thumb}>
                  <Ionicons name="tv-outline" size={18} color={colors.accent} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {p.name}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {p.channelCount} {p.channelCount === 1 ? 'channel' : 'channels'}
                  </Text>
                </View>
              </View>
              <Pressable hitSlop={8} onPress={() => onDelete(p)} style={styles.delete}>
                <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  heading: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '900',
  },
  hint: {
    color: colors.textMuted,
    fontSize: font.small,
    lineHeight: font.small * 1.5,
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: font.caption,
    fontWeight: '700',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: font.body,
  },
  error: {
    color: colors.accentSoft,
    fontSize: font.caption,
    marginTop: spacing.xs,
    fontWeight: '600',
  },
  empty: {
    color: colors.textMuted,
    fontSize: font.small,
    paddingVertical: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    padding: spacing.sm,
  },
  thumb: {
    width: 64,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  rowMeta: {
    color: colors.textMuted,
    fontSize: font.small,
    marginTop: 2,
  },
  delete: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
