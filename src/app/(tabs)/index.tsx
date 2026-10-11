import { router, useFocusEffect } from 'expo-router';
import { BlurTargetView } from 'expo-blur';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ContinueRow } from '@/components/continue-card';
import { EmptyState } from '@/components/empty-state';
import { ScanIndicator } from '@/components/scan-indicator';
import { SectionRow, type CardItem } from '@/components/section-row';
import { Thumb } from '@/components/thumb';
import {
  getHomeData,
  getRoot,
  setRoot,
  type HomeData,
  type ScanRoot,
} from '@/db/repositories';
import { fetchMissingPosters } from '@/features/metadata/fetcher';
import { pickMovieFolder } from '@/features/scanner/roots';
import { startScan, useScanState } from '@/features/scanner/scan-store';
import { setBlurTarget } from '@/lib/blur';
import { getHomePrefs, type HomePrefs } from '@/lib/prefs';
import { colors, font, radius, spacing } from '@/theme/colors';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [root, setRootState] = useState<ScanRoot | null | undefined>(undefined);
  const [data, setData] = useState<HomeData | null>(null);
  const [prefs, setPrefs] = useState<HomePrefs | null>(null);
  const scan = useScanState();
  const prevStatus = useRef(scan.status);
  const rootRef = useRef<View>(null);

  const reload = useCallback(async () => {
    const r = await getRoot();
    setRootState(r);
    setPrefs(await getHomePrefs());
    if (r) setData(await getHomeData());
  }, []);

  useFocusEffect(
    useCallback(() => {
      setBlurTarget(rootRef.current);
      reload();
    }, [reload]),
  );

  useEffect(() => {
    fetchMissingPosters().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (prevStatus.current !== 'done' && scan.status === 'done') {
      reload();
      fetchMissingPosters().catch(() => undefined);
    }
    prevStatus.current = scan.status;
  }, [scan.status, reload]);

  const onSelectFolder = useCallback(async () => {
    const picked = await pickMovieFolder();
    if (!picked) return;
    await setRoot(picked.uri, picked.name);
    await reload();
    startScan();
  }, [reload]);

  if (root === undefined) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!root) {
    return (
      <View style={[styles.onboard, { paddingTop: insets.top + spacing.xl }]}>
        <Text style={styles.logo}>
          Watch<Text style={styles.logoAccent}>Now</Text>
        </Text>
        <EmptyState
          title="Your offline library"
          message="WatchNow plays movies and series stored on this device. Select your Movie folder once — files never leave your phone."
        />
        <Button label="Select Movie Folder" onPress={onSelectFolder} />
      </View>
    );
  }

  const movieItems: CardItem[] =
    data?.movies.map((m) => ({
      id: m.id,
      kind: 'movie' as const,
      title: m.title,
      mediaId: m.mediaItemId,
      thumbnailPath: m.thumbnailPath,
      posterUrl: m.posterUrl,
      href: { pathname: '/movie/[id]', params: { id: String(m.id) } },
    })) ?? [];
  const seriesItems: CardItem[] =
    data?.series.map((s) => ({
      id: s.id,
      kind: 'series' as const,
      title: s.title,
      subtitle: `${s.episodeCount} episodes`,
      mediaId: s.coverMediaId,
      thumbnailPath: s.thumbnailPath,
      posterUrl: s.posterUrl,
      href: { pathname: '/series/[id]', params: { id: String(s.id) } },
    })) ?? [];
  const recentItems: CardItem[] =
    data?.recent.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.displayTitle,
      subtitle: r.subtitle,
      mediaId: r.mediaId,
      thumbnailPath: r.thumbnailPath,
      posterUrl: r.posterUrl,
      href:
        r.kind === 'movie'
          ? { pathname: '/movie/[id]', params: { id: String(r.id) } }
          : { pathname: '/series/[id]', params: { id: String(r.seriesId ?? r.id) } },
    })) ?? [];
  const favoriteItems: CardItem[] =
    data?.favorites.map((f) => ({
      id: f.id,
      kind: f.kind,
      title: f.title,
      subtitle: f.kind === 'series' ? 'Series' : 'Movie',
      mediaId: f.mediaId,
      thumbnailPath: f.thumbnailPath,
      posterUrl: f.posterUrl,
      href:
        f.kind === 'movie'
          ? { pathname: '/movie/[id]', params: { id: String(f.id) } }
          : { pathname: '/series/[id]', params: { id: String(f.id) } },
    })) ?? [];

  const featuredMovie = data?.movies.find((m) => m.thumbnailPath || m.posterUrl) ?? data?.movies[0];
  const featuredSeries =
    !featuredMovie
      ? (data?.series.find((s) => s.thumbnailPath || s.posterUrl) ?? data?.series[0])
      : undefined;
  const heroWidth = width - spacing.md * 2;
  const heroHeight = Math.round(heroWidth * 0.56);
  const isEmpty = (data?.movies.length ?? 0) + (data?.series.length ?? 0) === 0;

  return (
    <BlurTargetView ref={rootRef} style={styles.container}>
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <Text style={styles.logo}>
        Watch<Text style={styles.logoAccent}>Now</Text>
      </Text>
      <View style={styles.headerActions}>
        <Pressable onPress={() => startScan()} hitSlop={8}>
          <Text style={styles.headerAction}>Scan</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
          <Text style={styles.headerAction}>Settings</Text>
        </Pressable>
      </View>
    </View>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: spacing.xl + 72 }}
      contentInsetAdjustmentBehavior="automatic">
      <ScanIndicator />

      {isEmpty && scan.status !== 'scanning' && scan.status !== 'indexing' ? (
        <EmptyState
          title="No videos found yet"
          message="Hit Scan after adding files, or change your Movie folder in Settings."
        />
      ) : null}

      {featuredMovie || featuredSeries ? (
        <Pressable
          style={styles.hero}
          onPress={() => {
            if (featuredMovie) {
              router.push({ pathname: '/movie/[id]', params: { id: String(featuredMovie.id) } } as never);
            } else if (featuredSeries) {
              router.push({ pathname: '/series/[id]', params: { id: String(featuredSeries.id) } } as never);
            }
          }}>
          <Thumb
            mediaId={featuredMovie?.mediaItemId ?? null}
            uri={featuredMovie?.thumbnailPath ?? featuredSeries?.thumbnailPath ?? null}
            posterUrl={featuredMovie?.posterUrl ?? featuredSeries?.posterUrl ?? null}
            width={heroWidth}
            height={heroHeight}
            title={featuredMovie?.title ?? featuredSeries?.title}
            borderRadius={radius.lg}
          />
          <View style={styles.heroOverlay} pointerEvents="none">
            <Text style={styles.heroTitle} numberOfLines={2}>
              {featuredMovie?.title ?? featuredSeries?.title}
            </Text>
            <Text style={styles.heroSubtitle}>
              {featuredMovie ? 'Movie' : `${featuredSeries?.episodeCount ?? 0} episodes`}
            </Text>
          </View>
        </Pressable>
      ) : null}

      <View style={{ height: spacing.lg }} />

      <ContinueRow items={prefs?.continueWatching === false ? [] : (data?.continueWatching ?? [])} />
      {prefs?.recentlyAdded === false ? null : <SectionRow title="Recently Added" items={recentItems} />}
      {prefs?.favorites === false ? null : <SectionRow title="My Favorites" items={favoriteItems} />}
      <SectionRow title="Movies" items={movieItems} />
      <SectionRow title="Web Series" items={seriesItems} />
    </ScrollView>
    </BlurTargetView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loader: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboard: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  headerAction: {
    color: colors.textSecondary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  logo: {
    color: colors.text,
    fontSize: font.hero,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  logoAccent: {
    color: colors.accent,
  },
  hero: {
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  heroOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  heroTitle: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '900',
  },
  heroSubtitle: {
    color: colors.textSecondary,
    fontSize: font.caption,
    marginTop: 2,
  },
});
