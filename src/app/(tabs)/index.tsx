import { Ionicons } from '@expo/vector-icons';
import { BlurTargetView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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
import { listPlaylists, type YoutubePlaylist } from '@/features/youtube/store';
import { setBlurTarget } from '@/lib/blur';
import { getHomePrefs, type HomePrefs } from '@/lib/prefs';
import { colors, font, spacing } from '@/theme/colors';

type Filter = 'all' | 'movies' | 'series';

type HeroItem = {
  key: string;
  kind: 'movie' | 'series';
  id: number;
  mediaId?: number | null;
  thumbnailPath?: string | null;
  posterUrl?: string | null;
  title: string;
  episodeCount?: number;
};

const HERO_INTERVAL = 5000; // ms between automatic slides
const HERO_MAX_ITEMS = 6;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'movies', label: 'Movies' },
  { key: 'series', label: 'Series' },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [root, setRootState] = useState<ScanRoot | null | undefined>(undefined);
  const [data, setData] = useState<HomeData | null>(null);
  const [prefs, setPrefs] = useState<HomePrefs | null>(null);
  const [ytPlaylists, setYtPlaylists] = useState<YoutubePlaylist[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const scan = useScanState();
  const prevStatus = useRef(scan.status);
  const rootRef = useRef<View>(null);
  const [scrollY] = useState(() => new Animated.Value(0));
  const heroListRef = useRef<FlatList<HeroItem>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // Mix of movies and series (alternating), preferring items that have artwork
  const heroItems = useMemo<HeroItem[]>(() => {
    if (!data) return [];
    const pick = <T extends { thumbnailPath?: string | null; posterUrl?: string | null }>(list: T[]) => {
      const withArt = list.filter((x) => x.thumbnailPath || x.posterUrl);
      return (withArt.length ? withArt : list).slice(0, HERO_MAX_ITEMS / 2 + 1);
    };
    const movies: HeroItem[] = pick(data.movies).map((m) => ({
      key: `movie-${m.id}`,
      kind: 'movie',
      id: m.id,
      mediaId: m.mediaItemId,
      thumbnailPath: m.thumbnailPath,
      posterUrl: m.posterUrl,
      title: m.title,
    }));
    const series: HeroItem[] = pick(data.series).map((s) => ({
      key: `series-${s.id}`,
      kind: 'series',
      id: s.id,
      mediaId: s.coverMediaId,
      thumbnailPath: s.thumbnailPath,
      posterUrl: s.posterUrl,
      title: s.title,
      episodeCount: s.episodeCount,
    }));
    const out: HeroItem[] = [];
    for (let i = 0; i < Math.max(movies.length, series.length); i++) {
      if (movies[i]) out.push(movies[i]);
      if (series[i]) out.push(series[i]);
    }
    return out.slice(0, HERO_MAX_ITEMS);
  }, [data]);

  // Auto-advance; the timer restarts after every slide change and pauses while dragging
  useEffect(() => {
    if (heroItems.length < 2 || paused) return;
    const t = setTimeout(() => {
      const next = (activeIndex + 1) % heroItems.length;
      heroListRef.current?.scrollToOffset({ offset: next * width, animated: true });
    }, HERO_INTERVAL);
    return () => clearTimeout(t);
  }, [activeIndex, heroItems.length, paused, width]);

  const reload = useCallback(async () => {
    const r = await getRoot();
    setRootState(r);
    setPrefs(await getHomePrefs());
    if (r) setData(await getHomeData());
    listPlaylists().then(setYtPlaylists).catch(() => undefined);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setBlurTarget(rootRef);
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
  const youtubeItems: CardItem[] = ytPlaylists.map((p) => ({
    id: p.id,
    kind: 'series' as const,
    title: p.title,
    subtitle: `${p.videoCount} ${p.videoCount === 1 ? 'video' : 'videos'}`,
    posterUrl: p.thumbnailUrl,
    href: { pathname: '/youtube/[id]', params: { id: String(p.id) } },
  }));

  const hasFeatured = heroItems.length > 0;
  const heroHeight = Math.round(Math.min(height * 0.62, width * 1.4));
  const isEmpty = (data?.movies.length ?? 0) + (data?.series.length ?? 0) === 0;
  const scanning = scan.status === 'scanning' || scan.status === 'indexing';

  // Header: floats over the hero, becomes solid after scrolling
  const headerBg = scrollY.interpolate({
    inputRange: [0, 140],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const headerGradient = scrollY.interpolate({
    inputRange: [0, 140],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const headerHeight = insets.top + spacing.sm + 40 + 44;

  const openHero = (item: HeroItem) => {
    router.push({
      pathname: item.kind === 'movie' ? '/movie/[id]' : '/series/[id]',
      params: { id: String(item.id) },
    } as never);
  };

  const playHero = (item: HeroItem) => {
    if (item.kind === 'movie' && item.mediaId != null) {
      router.push({
        pathname: '/player',
        params: { mediaId: String(item.mediaId), entryId: String(item.id) },
      } as never);
    } else {
      openHero(item);
    }
  };

  const onHeroScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    setActiveIndex(Math.max(0, Math.min(heroItems.length - 1, i)));
  };

  const renderHero = ({ item }: { item: HeroItem }) => (
    <Pressable onPress={() => openHero(item)} style={{ width, height: heroHeight }}>
      <Thumb
        mediaId={item.mediaId ?? null}
        uri={item.thumbnailPath ?? null}
        posterUrl={item.posterUrl ?? null}
        width={width}
        height={heroHeight}
        title={item.title}
        borderRadius={0}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent', 'rgba(0,0,0,0.35)', colors.background]}
        locations={[0, 0.3, 0.6, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.heroContent} pointerEvents="box-none">
        <View style={styles.heroBadgeRow} pointerEvents="none">
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>{item.kind === 'movie' ? 'MOVIE' : 'SERIES'}</Text>
          </View>
          {item.kind === 'series' && item.episodeCount != null ? (
            <Text style={styles.heroMeta}>{item.episodeCount} episodes</Text>
          ) : null}
        </View>
        <Text style={styles.heroTitle} numberOfLines={2} pointerEvents="none">
          {item.title}
        </Text>
        <View style={styles.heroButtons}>
          <Pressable
            onPress={() => playHero(item)}
            style={({ pressed }) => [styles.heroPlay, pressed && styles.pressed]}>
            <Ionicons name="play" size={20} color="#000" />
            <Text style={styles.heroPlayText}>{item.kind === 'movie' ? 'Play' : 'View'}</Text>
          </Pressable>
          <Pressable
            onPress={() => openHero(item)}
            style={({ pressed }) => [styles.heroInfo, pressed && styles.pressed]}>
            <Ionicons name="information-circle-outline" size={20} color={colors.text} />
            <Text style={styles.heroInfoText}>Info</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );

  const showAll = filter === 'all';

  return (
    <BlurTargetView ref={rootRef} style={styles.container}>
      <Animated.ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        contentContainerStyle={{
          paddingTop: hasFeatured ? 0 : headerHeight,
          paddingBottom: spacing.xl + 72,
        }}>
        {/* HERO */}
        {hasFeatured ? (
          <View style={{ height: heroHeight }}>
            <FlatList
              ref={heroListRef}
              data={heroItems}
              keyExtractor={(i) => i.key}
              renderItem={renderHero}
              horizontal
              pagingEnabled
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
              scrollEventThrottle={16}
              onScroll={onHeroScroll}
              onScrollBeginDrag={() => setPaused(true)}
              onScrollEndDrag={() => setPaused(false)}
              onMomentumScrollEnd={() => setPaused(false)}
            />
            {heroItems.length > 1 ? (
              <View style={styles.dots} pointerEvents="none">
                {heroItems.map((item, i) => (
                  <View key={item.key} style={[styles.dot, i === activeIndex && styles.dotActive]} />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <ScanIndicator />

        {isEmpty && !scanning ? (
          <EmptyState
            title="No videos found yet"
            message="Hit Scan after adding files, or change your Movie folder in Settings."
          />
        ) : null}

        <View style={{ height: spacing.sm }} />

        {showAll ? (
          <ContinueRow items={prefs?.continueWatching === false ? [] : (data?.continueWatching ?? [])} />
        ) : null}
        {showAll && prefs?.recentlyAdded !== false ? (
          <SectionRow title="Recently Added" items={recentItems} />
        ) : null}
        {showAll && prefs?.favorites !== false ? (
          <SectionRow title="My Favorites" items={favoriteItems} />
        ) : null}
        {showAll || filter === 'movies' ? <SectionRow title="Movies" items={movieItems} /> : null}
        {showAll || filter === 'series' ? <SectionRow title="Web Series" items={seriesItems} /> : null}
        {(showAll || filter === 'series') && prefs?.youtubeShows !== false ? (
          <SectionRow title="YouTube Shows" items={youtubeItems} />
        ) : null}
      </Animated.ScrollView>

      {/* FLOATING HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: headerGradient }]}
          pointerEvents="none">
          <LinearGradient
            colors={['rgba(0,0,0,0.75)', 'transparent']}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, opacity: headerBg }]}
          pointerEvents="none"
        />

        <View style={styles.headerTop}>
          <Text style={styles.logo}>
            Watch<Text style={styles.logoAccent}>Now</Text>
          </Text>
          <View style={styles.headerActions}>
            <Pressable onPress={() => startScan()} hitSlop={10} style={styles.iconBtn}>
              {scanning ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons name="sync-outline" size={22} color={colors.text} />
              )}
            </Pressable>
            <Pressable onPress={() => router.push('/search')} hitSlop={10} style={styles.iconBtn}>
              <Ionicons name="search-outline" size={22} color={colors.text} />
            </Pressable>
            <Pressable onPress={() => router.push('/settings')} hitSlop={10} style={styles.iconBtn}>
              <Ionicons name="settings-outline" size={22} color={colors.text} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}>
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
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
  pressed: {
    opacity: 0.7,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingBottom: spacing.xs,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    height: 40,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  iconBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
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
  chipRow: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    paddingTop: spacing.xs,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  chipActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  chipText: {
    color: colors.text,
    fontSize: font.caption,
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#000',
  },
  heroContent: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md + 18,
    gap: spacing.sm,
    alignItems: 'center',
  },
  dots: {
    position: 'absolute',
    bottom: spacing.sm,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    width: 18,
    backgroundColor: '#fff',
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroBadge: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  heroBadgeText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  heroMeta: {
    color: colors.textSecondary,
    fontSize: font.caption,
    fontWeight: '600',
  },
  heroTitle: {
    color: colors.text,
    fontSize: font.hero,
    fontWeight: '900',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  heroButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignSelf: 'stretch',
    marginTop: spacing.xs,
  },
  heroPlay: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: '#fff',
    borderRadius: 8,
    height: 46,
  },
  heroPlayText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800',
  },
  heroInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(120,120,120,0.55)',
    borderRadius: 8,
    height: 46,
  },
  heroInfoText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
