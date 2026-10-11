import { Ionicons } from '@expo/vector-icons';
import { BlurTargetView } from 'expo-blur';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
import { folderStillAccessible, pickMovieFolder } from '@/features/scanner/roots';
import { startScan } from '@/features/scanner/scan-store';
import { setBlurTarget } from '@/lib/blur';
import { getHomePrefs, setHomePref, type HomePrefKey, type HomePrefs } from '@/lib/prefs';
import {
  checkForLatestRelease,
  compareSemver,
  getInstalledVersion,
  shareApp,
  type LatestRelease,
} from '@/lib/update';
import { colors, font, radius, spacing } from '@/theme/colors';
import { formatBytes, formatTimestamp } from '@/utils/format';

type IoniconName = keyof typeof Ionicons.glyphMap;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function ToggleRow({
  icon,
  label,
  hint,
  value,
  onValueChange,
  divider,
}: {
  icon: IoniconName;
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  divider?: boolean;
}) {
  return (
    <>
      <View style={styles.row}>
        <Ionicons name={icon} size={18} color={colors.textSecondary} style={styles.rowIcon} />
        <View style={styles.rowBody}>
          <Text style={styles.rowLabel} numberOfLines={1}>
            {label}
          </Text>
          {hint ? (
            <Text style={styles.rowHint} numberOfLines={2}>
              {hint}
            </Text>
          ) : null}
        </View>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: colors.surfaceHover, true: colors.accent }}
          thumbColor="#ffffff"
        />
      </View>
      {divider ? <Divider /> : null}
    </>
  );
}

function SettingRow({
  icon,
  label,
  hint,
  value,
  tint,
  onPress,
  accessory,
  divider,
}: {
  icon: IoniconName;
  label: string;
  hint?: string;
  value?: string;
  tint?: string;
  onPress?: () => void;
  accessory?: React.ReactNode;
  divider?: boolean;
}) {
  const content = (
    <>
      <Ionicons name={icon} size={18} color={tint ?? colors.textSecondary} style={styles.rowIcon} />
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, tint ? { color: tint } : null]} numberOfLines={1}>
          {label}
        </Text>
        {hint ? (
          <Text style={styles.rowHint} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={[styles.rowValue, tint ? { color: tint } : null]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {accessory ??
        (onPress ? <Ionicons name="chevron-forward" size={14} color={colors.textMuted} /> : null)}
    </>
  );
  return (
    <>
      {onPress ? (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
          {content}
        </Pressable>
      ) : (
        <View style={styles.row}>{content}</View>
      )}
      {divider ? <Divider /> : null}
    </>
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

function InfoModal({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => undefined}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
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
  const [latest, setLatest] = useState<LatestRelease | null>(null);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [artworkOpen, setArtworkOpen] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [prefs, setPrefs] = useState<HomePrefs>({
    recentlyAdded: true,
    continueWatching: true,
    youtubeShows: true,
    favorites: true,
  });
  const rootRef = useRef<View>(null);

  const installed = getInstalledVersion();
  const hasUpdate = Boolean(latest && compareSemver(latest.version, installed) > 0);

  const reload = useCallback(async () => {
    const r = await getRoot();
    setRootState(r);
    setStats(await getStats());
    if (r) setAccessible(folderStillAccessible(r.documentUri));
    setTmdbKey((await getSetting('tmdb_api_key')) ?? '');
    setOmdbKey((await getSetting('omdb_api_key')) ?? '');
    setPrefs(await getHomePrefs());
  }, []);

  useFocusEffect(
    useCallback(() => {
      setBlurTarget(rootRef.current);
      reload();
    }, [reload]),
  );

  const checkUpdates = useCallback(async () => {
    setChecking(true);
    setLatest(await checkForLatestRelease());
    setChecking(false);
    setChecked(true);
  }, []);

  useEffect(() => {
    if (checked) return;
    checkForLatestRelease().then((r) => {
      setLatest(r);
      setChecked(true);
    });
  }, [checked]);

  const onTogglePref = useCallback((key: HomePrefKey, value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    setHomePref(key, value).catch(() => undefined);
  }, []);

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

  const onShareApp = useCallback(() => {
    shareApp().catch(() => Alert.alert('Error', 'Sharing is not available on this device.'));
  }, []);

  const onUpdateApp = useCallback(() => {
    if (hasUpdate && latest) {
      void WebBrowser.openBrowserAsync(latest.url);
    } else {
      void checkUpdates();
    }
  }, [hasUpdate, latest, checkUpdates]);

  return (
    <BlurTargetView ref={rootRef} style={styles.container}>
    <View style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.background }}>
      <Text style={styles.heading}>Settings</Text>
    </View>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.xl + 72,
      }}>
      <ScanIndicator />

      <View style={styles.identity}>
        <View style={styles.identityBadge}>
          <Ionicons name="film" size={26} color={colors.accent} />
        </View>
        <View style={styles.identityBody}>
          <Text style={styles.identityName}>WatchNow</Text>
          <Text style={styles.identityTag}>Offline media library</Text>
        </View>
        <View style={styles.versionPill}>
          <Text style={styles.versionPillText}>{installed}</Text>
        </View>
      </View>

      <Section title="Customization">
        <SettingRow
          icon="options-outline"
          label="Home screen sections"
          hint="Choose what appears on the Home tab"
          onPress={() => setCustomOpen(true)}
        />
      </Section>

      <Section title="Library">
        <SettingRow
          icon="folder-open"
          label={
            root?.displayName
              ? root.displayName.charAt(0).toUpperCase() + root.displayName.slice(1)
              : 'No folder selected'
          }
          hint={root?.documentUri ?? 'Pick a folder to start scanning'}
          onPress={onChangeFolder}
          divider
        />
        <SettingRow
          icon="time-outline"
          label="Last scan"
          value={formatTimestamp(root?.lastSuccessfulScanAt)}
          divider
        />
        <SettingRow
          icon={
            !root
              ? 'alert-circle-outline'
              : accessible
                ? 'checkmark-circle-outline'
                : 'warning-outline'
          }
          label={
            !root
              ? 'Folder access not set up'
              : accessible
                ? 'Folder access OK'
                : 'Permission lost — reselect the folder'
          }
          tint={!root ? colors.textMuted : accessible ? colors.success : colors.warning}
          divider
        />
        <SettingRow icon="refresh" label="Rescan library" onPress={() => startScan()} divider />
        <SettingRow
          icon="swap-horizontal"
          label={root ? 'Change folder' : 'Choose folder'}
          onPress={onChangeFolder}
          {...(root && !accessible ? { divider: true } : {})}
        />
        {root && !accessible ? (
          <SettingRow icon="lock-open-outline" label="Re-grant access" onPress={onChangeFolder} />
        ) : null}
      </Section>

      <Section title="Index">
        <SettingRow
          icon="stats-chart-outline"
          label="Index details"
          hint="Counts, file total & library size"
          onPress={() => setIndexOpen(true)}
        />
      </Section>

      <Section title="Artwork">
        <SettingRow
          icon="color-wand-outline"
          label="Artwork settings"
          hint="Poster providers, API keys & refresh"
          onPress={() => setArtworkOpen(true)}
        />
      </Section>

      <Section title="YouTube">
        <SettingRow
          icon="logo-youtube"
          label="YouTube playlists"
          hint="Add & manage playlists"
          onPress={() => router.push('/youtube')}
        />
      </Section>

      <Section title="Maintenance">
        <SettingRow
          icon="trash-outline"
          label="Clear thumbnail cache"
          onPress={() => {
            clearThumbnailCache()
              .then(() => Alert.alert('Done', 'Thumbnail cache cleared.'))
              .catch(() => Alert.alert('Error', 'Could not clear thumbnail cache.'));
          }}
          divider
        />
        <SettingRow
          icon="list-outline"
          label="Classification review"
          onPress={() => router.push('/review')}
        />
      </Section>

      <Section title="About">
        <SettingRow
          icon={hasUpdate ? 'arrow-down-circle' : 'arrow-down-circle-outline'}
          label="Update app"
          tint={hasUpdate ? colors.warning : undefined}
          accessory={
            <>
              {hasUpdate ? (
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>NEW</Text>
                </View>
              ) : null}
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </>
          }
          onPress={onUpdateApp}
          divider
        />
        <SettingRow icon="information-circle-outline" label="Installed version" value={installed} divider />
        <SettingRow
          icon="sparkles-outline"
          label="Latest version"
          value={latest?.version ?? '—'}
          tint={hasUpdate ? colors.warning : undefined}
          divider
        />
        <SettingRow
          icon="refresh-outline"
          label="Check for updates"
          onPress={checking ? undefined : checkUpdates}
          accessory={
            checking ? <ActivityIndicator size="small" color={colors.accent} /> : undefined
          }
          divider
        />
        <SettingRow
          icon="share-social-outline"
          label="Share app"
          hint="Send the download link to a friend"
          onPress={onShareApp}
        />
      </Section>

      <Text style={styles.footer}>
        WatchNow v{installed} ({Constants.expoConfig?.android?.versionCode ?? 1}) · playback never leaves your device
      </Text>
      <Text style={styles.footer}>
        This product uses the TMDB API but is not endorsed or certified by TMDB. Show data from{' '}
        <Text style={styles.link} onPress={() => Linking.openURL('https://www.tvmaze.com/api')}>
          TVmaze
        </Text>
        . Movie data from OMDb.
      </Text>

      <InfoModal visible={customOpen} title="Customization" onClose={() => setCustomOpen(false)}>
        <Text style={styles.hint}>Show or hide sections on the Home tab. Changes apply the next time Home loads.</Text>
        <View style={styles.modalRows}>
          <ToggleRow
            icon="time-outline"
            label="Show recently added"
            hint="Row of the newest movies and series"
            value={prefs.recentlyAdded}
            onValueChange={(v) => onTogglePref('recentlyAdded', v)}
            divider
          />
          <ToggleRow
            icon="play-circle-outline"
            label="Show continue watching"
            hint="Row of half-watched videos"
            value={prefs.continueWatching}
            onValueChange={(v) => onTogglePref('continueWatching', v)}
            divider
          />
          <ToggleRow
            icon="heart-outline"
            label="Show My Favorites"
            hint="Favorites row above Movies"
            value={prefs.favorites}
            onValueChange={(v) => onTogglePref('favorites', v)}
            divider
          />
          <ToggleRow
            icon="logo-youtube"
            label="Show YouTube shows"
            hint="Coming in a future update"
            value={prefs.youtubeShows}
            onValueChange={(v) => onTogglePref('youtubeShows', v)}
          />
        </View>
      </InfoModal>

      <InfoModal visible={artworkOpen} title="Artwork" onClose={() => setArtworkOpen(false)}>
        <Text style={styles.hint}>
          Fetches cover art from TMDB, TVmaze and OMDb; local video frames stay as fallback. Keys are stored only on
          this device. TMDB is blocked on some Indian ISPs; the others still work.
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
        <View style={styles.modalRows}>
          <SettingRow
            icon="color-wand-outline"
            label="Refresh missing posters"
            onPress={() => {
              setArtworkOpen(false);
              onRefreshPosters();
            }}
          />
        </View>
      </InfoModal>

      <InfoModal visible={indexOpen} title="Index" onClose={() => setIndexOpen(false)}>
        <View style={styles.statStrip}>
          <Stat value={String(stats?.movieCount ?? 0)} label="Movies" />
          <Stat value={String(stats?.seriesCount ?? 0)} label="Series" />
          <Stat value={String(stats?.episodeCount ?? 0)} label="Episodes" />
        </View>
        <View style={styles.sizeStrip}>
          <Row label="Video files" value={String(stats?.mediaCount ?? 0)} divider />
          <Row label="Total size" value={formatBytes(stats?.totalBytes) || '—'} />
        </View>
      </InfoModal>
    </ScrollView>
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
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  identityBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityBody: {
    flex: 1,
  },
  identityName: {
    color: colors.text,
    fontSize: font.heading,
    fontWeight: '800',
  },
  identityTag: {
    color: colors.textMuted,
    fontSize: font.small,
    marginTop: 2,
  },
  versionPill: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  versionPillText: {
    color: colors.textSecondary,
    fontSize: font.small,
    fontWeight: '700',
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
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: 13,
  },
  rowPressed: {
    backgroundColor: colors.surfaceRaised,
  },
  rowIcon: {
    width: 20,
  },
  rowBody: {
    flex: 1,
  },
  rowLabel: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '600',
  },
  rowHint: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: 2,
  },
  rowValue: {
    color: colors.textSecondary,
    fontSize: font.small,
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  newBadge: {
    backgroundColor: colors.warning,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: spacing.xs,
  },
  newBadgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  modalTitle: {
    color: colors.text,
    fontSize: font.heading,
    fontWeight: '800',
  },
  modalBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  modalRows: {
    marginTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  statStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
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
  },
  hint: {
    color: colors.textMuted,
    fontSize: font.small,
    paddingTop: spacing.md,
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
  footer: {
    color: colors.textMuted,
    fontSize: font.small,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
