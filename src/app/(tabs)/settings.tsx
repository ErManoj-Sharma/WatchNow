import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Row } from '@/components/progress-bar';
import { ScanIndicator } from '@/components/scan-indicator';
import { clearThumbnailCache, getRoot, getStats, setRoot, type LibraryStats, type ScanRoot } from '@/db/repositories';
import { pickMovieFolder, folderStillAccessible } from '@/features/scanner/roots';
import { startScan } from '@/features/scanner/scan-store';
import { colors, font, radius, spacing } from '@/theme/colors';
import { formatBytes, formatTimestamp } from '@/utils/format';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [root, setRootState] = useState<ScanRoot | null>(null);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [accessible, setAccessible] = useState(true);

  const reload = useCallback(async () => {
    const r = await getRoot();
    setRootState(r);
    setStats(await getStats());
    if (r) setAccessible(folderStillAccessible(r.documentUri));
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

      <Text style={styles.footer}>WatchNow · offline media library · nothing leaves your device</Text>
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
