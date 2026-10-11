import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { fetchPlaylistWithItems } from '@/features/youtube/api';
import { parsePlaylistId } from '@/features/youtube/parse';
import {
  deletePlaylist,
  listPlaylists,
  savePlaylist,
  type YoutubePlaylist,
} from '@/features/youtube/store';
import { colors, font, radius, spacing } from '@/theme/colors';

export default function YoutubeLibraryScreen() {
  const insets = useSafeAreaInsets();
  const [playlists, setPlaylists] = useState<YoutubePlaylist[]>([]);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasKey = Boolean(process.env.EXPO_PUBLIC_YOUTUBE_API_KEY);

  const reload = useCallback(() => {
    listPlaylists().then(setPlaylists).catch(() => undefined);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const onAdd = useCallback(async () => {
    const playlistId = parsePlaylistId(url);
    if (!playlistId) {
      setError("That doesn't look like a YouTube playlist URL.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { meta, items } = await fetchPlaylistWithItems(playlistId);
      await savePlaylist(meta, url.trim(), items);
      setUrl('');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that playlist.');
    } finally {
      setBusy(false);
    }
  }, [url, reload]);

  const onDelete = useCallback(
    (p: YoutubePlaylist) => {
      Alert.alert(
        'Remove playlist?',
        `"${p.title}" will be removed from WatchNow. The videos stay on YouTube.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              deletePlaylist(p.id).then(reload);
            },
          },
        ],
      );
    },
    [reload],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.heading}>YouTube</Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.xl + insets.bottom,
        }}>
        <Text style={styles.hint}>
          Paste a public YouTube playlist URL to add its videos to a “YouTube shows” row on Home.
          Episodes stream from YouTube and need an internet connection.
        </Text>
        {!hasKey ? (
          <Text style={styles.warn}>
            No YouTube API key found (EXPO_PUBLIC_YOUTUBE_API_KEY). Adding playlists is disabled
            until the app is built with a key.
          </Text>
        ) : null}

        <Text style={styles.fieldLabel}>Playlist URL</Text>
        <TextInput
          value={url}
          onChangeText={(t) => {
            setUrl(t);
            setError(null);
          }}
          placeholder="youtube.com/playlist?list=..."
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={{ marginTop: spacing.md }}>
          <Button label={busy ? 'Adding…' : 'Add playlist'} onPress={onAdd} disabled={busy || !url.trim() || !hasKey} />
        </View>

        <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>
          {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'} added
        </Text>
        {playlists.length === 0 ? (
          <Text style={styles.empty}>No playlists yet.</Text>
        ) : (
          playlists.map((p) => (
            <View key={p.id} style={styles.row}>
              <Pressable
                style={({ pressed }) => [styles.rowMain, pressed && styles.rowPressed]}
                onPress={() => router.push({ pathname: '/youtube/[id]', params: { id: String(p.id) } } as never)}>
                {p.thumbnailUrl ? (
                  <Image source={{ uri: p.thumbnailUrl }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={styles.thumb}>
                    <Ionicons name="logo-youtube" size={18} color={colors.accent} />
                  </View>
                )}
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {p.title}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {p.videoCount} {p.videoCount === 1 ? 'video' : 'videos'}
                    {p.channelTitle ? `  ·  ${p.channelTitle}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
              </Pressable>
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
  warn: {
    color: colors.warning,
    fontSize: font.caption,
    marginTop: spacing.sm,
    lineHeight: font.caption * 1.5,
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
  rowPressed: {
    backgroundColor: colors.surfaceRaised,
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
