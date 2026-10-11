import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Row } from '@/components/progress-bar';
import { ScanIndicator } from '@/components/scan-indicator';
import {
  clearThumbnailCache,
  getRoot,
  getSetting,
  getStats,
  resetPosterAttempts,
  setRoot,
  setSetting,
  type LibraryStats,
  type ScanRoot,
} from '@/db/repositories';
import { fetchMissingPosters } from '@/features/metadata/fetcher';
import { pickMovieFolder, folderStillAccessible } from '@/features/scanner/roots';
import { startScan } from '@/features/scanner/scan-store';
import { colors, font, radius, spacing } from '@/theme/colors';
import { formatBytes, formatTimestamp } from '@/utils/format';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [root, setRootState] = useState<ScanRoot | null>(null);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [accessible, setAccessible] = useState(true);
  const [tmdbKey, setTmdbKey] = useState('');
  const [omdbKey, setOmdbKey] = useState('');
  const [tmdbSaved, setTmdbSaved] = useState(false);
  const [omdbSaved, setOmdbSaved] = useState(false);

  const reload = useCallback(async () => {
    const r = await getRoot();
    setRootState(r);
    setStats(await getStats());
    if (r) setAccessible(folderStillAccessible(r.documentUri));
    setTmdbKey((await getSetting('tmdb_api_key')) ?? '');
    setOmdbKey((await getSetting('omdb_api_key')) ?? '');
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const onChangeFolder = useCallback(async () => {
    const picked = await pickMovieFolder();
    if (!picked) return;
    Alert.alert(
      'Change Movie folder?',
      'The current library index and watch history will be replaced by a fresh scan of the new folder.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change',
          style: 'destructive',
          onPress: async () => {
            await setRoot(picked.uri, picked.name);
            await reload();
            startScan();
          },
        },
      ],
    );
  }, [reload]);

  const saveKey = useCallback(async (key: 'tmdb_api_key' | 'omdb_api_key', value: string) => {
    await setSetting(key, value);
    if (key === 'tmdb_api_key') {
      setTmdbSaved(true);
      setTimeout(() => setTmdbSaved(false), 1500);
    } else {
      setOmdbSaved(true);
      setTimeout(() => setOmdbSaved(false), 1500);
    }
    fetchMissingPosters().catch(() => undefined);
  }, []);

  const onRefreshPosters = useCallback(async () => {
    await resetPosterAttempts();
    const applied = await fetchMissingPosters();
    Alert.alert('Posters refreshed', `${applied} poster(s) matched and applied.`);
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.sm,
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.xl,
      }}>
      <Text style={styles.heading}>Library Settings</Text>
      <ScanIndicator />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Movie folder</Text>
        <Row label="Name" value={root?.displayName ?? 'Not selected'} />
        <Row label="Location" value={root?.documentUri ?? '—'} />
        <Row label="Last scan" value={formatTimestamp(root?.lastSuccessfulScanAt)} />
        <Row label="Access" value={root ? (accessible ? 'OK' : 'Permission lost — reselect folder') : '—'} />
        <View style={styles.actions}>
          <Button label="Rescan library" onPress={() => startScan()} />
          <Button label="Change folder" variant="secondary" onPress={onChangeFolder} />
          {root && !accessible ? <Button label="Re-grant access" variant="secondary" onPress={onChangeFolder} /> : null}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Index statistics</Text>
        <Row label="Video files" value={String(stats?.mediaCount ?? 0)} />
        <Row label="Movies" value={String(stats?.movieCount ?? 0)} />
        <Row label="Series" value={String(stats?.seriesCount ?? 0)} />
        <Row label="Episodes" value={String(stats?.episodeCount ?? 0)} />
        <Row label="Missing files" value={String(stats?.missingCount ?? 0)} />
        <Row label="Total size" value={formatBytes(stats?.totalBytes) || '—'} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Online posters</Text>
        <Text style={styles.hint}>
          Optional. Fetches poster art from TMDB (movies + shows), TVmaze (shows backup), and OMDb. Local video frames stay as
          fallback. Keys are stored only on this device. An OMDb key is bundled as default; enter your own to override. Note:
          TMDB is blocked on some Indian ISPs — TVmaze/OMDb still work.
        </Text>
        <Text style={styles.fieldLabel}>TMDB API key</Text>
        <TextInput
          value={tmdbKey}
          onChangeText={setTmdbKey}
          onBlur={() => saveKey('tmdb_api_key', tmdbKey)}
          placeholder="tmdb.org/settings/api"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={styles.input}
        />
        {tmdbSaved ? <Text style={styles.saved}>Saved</Text> : null}
        <Text style={styles.fieldLabel}>OMDb API key (optional)</Text>
        <TextInput
          value={omdbKey}
          onChangeText={setOmdbKey}
          onBlur={() => saveKey('omdb_api_key', omdbKey)}
          placeholder="omdbapi.com"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={styles.input}
        />
        {omdbSaved ? <Text style={styles.saved}>Saved</Text> : null}
        <View style={styles.actions}>
          <Button label="Refresh missing posters" variant="secondary" onPress={onRefreshPosters} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Maintenance</Text>
        <View style={styles.actions}>
          <Button
            label="Clear thumbnail cache"
            variant="secondary"
            onPress={() => {
              clearThumbnailCache()
                .then(() => Alert.alert('Done', 'Thumbnail cache cleared.'))
                .catch(() => Alert.alert('Error', 'Could not clear thumbnail cache.'));
            }}
          />
          <Button label="Classification review" variant="secondary" onPress={() => router.push('/review')} />
        </View>
      </View>

      <Text style={styles.footer}>WatchNow · offline media library · playback never leaves your device</Text>
      <Text style={styles.footer}>
        This product uses the TMDB API but is not endorsed or certified by TMDB. Show data from{' '}
        <Text style={styles.link} onPress={() => Linking.openURL('https://www.tvmaze.com/api')}>
          TVmaze
        </Text>
        . Movie data from OMDb.
      </Text>
    </ScrollView>
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardTitle: {
    color: colors.text,
    fontSize: font.heading,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  hint: {
    color: colors.textMuted,
    fontSize: font.small,
    marginBottom: spacing.sm,
    lineHeight: font.small * 1.4,
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: font.caption,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: font.body,
  },
  saved: {
    color: colors.accent,
    fontSize: font.caption,
    marginTop: spacing.xs,
  },
  link: {
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  footer: {
    color: colors.textMuted,
    fontSize: font.small,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
