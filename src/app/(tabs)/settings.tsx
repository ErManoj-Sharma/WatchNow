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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Stat({ value, label, tint }: { value: string; label: string; tint?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tint ? { color: tint } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

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
      <Text style={styles.heading}>Settings</Text>
      <ScanIndicator />

      <Section title="Library">
        <Text style={styles.folderName}>{root?.displayName ?? 'No folder selected'}</Text>
        <Text style={styles.folderUri} numberOfLines={1} selectable>
          {root?.documentUri ?? 'Pick a folder to start scanning'}
        </Text>
        <Row label="Last scan" value={formatTimestamp(root?.lastSuccessfulScanAt)} divider />
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: !root ? colors.textMuted : accessible ? colors.success : colors.warning },
            ]}
          />
          <Text style={styles.statusText}>
            {!root ? 'Folder access not set up' : accessible ? 'Folder access OK' : 'Permission lost — reselect the folder'}
          </Text>
        </View>
        <View style={styles.actions}>
          <Button label="Rescan library" onPress={() => startScan()} />
          <Button label={root ? 'Change folder' : 'Choose folder'} variant="secondary" onPress={onChangeFolder} />
          {root && !accessible ? <Button label="Re-grant access" variant="secondary" onPress={onChangeFolder} /> : null}
        </View>
      </Section>

      <Section title="Index">
        <View style={styles.statStrip}>
          <Stat value={String(stats?.movieCount ?? 0)} label="Movies" />
          <Stat value={String(stats?.seriesCount ?? 0)} label="Series" />
          <Stat value={String(stats?.episodeCount ?? 0)} label="Episodes" />
          <Stat
            value={String(stats?.missingCount ?? 0)}
            label="Missing"
            tint={(stats?.missingCount ?? 0) > 0 ? colors.warning : undefined}
          />
        </View>
        <View style={styles.sizeStrip}>
          <Row label="Video files" value={String(stats?.mediaCount ?? 0)} divider />
          <Row label="Total size" value={formatBytes(stats?.totalBytes) || '—'} />
        </View>
      </Section>

      <Section title="Artwork">
        <Text style={styles.hint}>
          Optional — fetches cover art from TMDB, TVmaze and OMDb; local video frames stay as fallback. Keys are stored only
          on this device. TMDB is blocked on some Indian ISPs; the others still work.
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
      </Section>

      <Section title="Maintenance">
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
      </Section>

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
  section: {
    marginBottom: spacing.lg,
  },
  eyebrow: {
    color: colors.accentSoft,
    fontSize: font.small,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  folderName: {
    color: colors.text,
    fontSize: font.heading,
    fontWeight: '800',
  },
  folderUri: {
    color: colors.textMuted,
    fontSize: font.small,
    marginTop: 2,
    marginBottom: spacing.xs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: font.caption,
  },
  statStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: colors.text,
    fontSize: font.hero,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: font.small,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  sizeStrip: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
  },
  hint: {
    color: colors.textMuted,
    fontSize: font.small,
    marginBottom: spacing.md,
    lineHeight: font.small * 1.5,
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
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: font.body,
  },
  saved: {
    color: colors.success,
    fontSize: font.caption,
    marginTop: spacing.xs,
    fontWeight: '700',
  },
  link: {
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  footer: {
    color: colors.textMuted,
    fontSize: font.small,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
