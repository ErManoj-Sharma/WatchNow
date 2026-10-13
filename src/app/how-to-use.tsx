import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, font, radius, spacing } from '@/theme/colors';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Icon = keyof typeof Ionicons.glyphMap;

type Chip = { icon: Icon; label: string; action: string };

type TreeNode = {
  name: string;
  type: 'folder' | 'file';
  depth: number;
  tag?: string;
};

type GuideSection = {
  icon: Icon;
  title: string;
  summary: string;
  steps: string[];
  chips?: Chip[];
  tree?: TreeNode[];
  links?: { label: string; url: string }[];
};

const FOLDER_TREE: TreeNode[] = [
  { name: 'Library folder', type: 'folder', depth: 0, tag: 'any name' },

  { name: 'MovieName1.mkv', type: 'file', depth: 1, tag: 'movie' },
  { name: 'MovieName2.mkv', type: 'file', depth: 1, tag: 'movie' },

  { name: 'Show Name 1', type: 'folder', depth: 1, tag: 'series' },
  { name: 'Season 01', type: 'folder', depth: 2 },
  { name: 'S1E1.mkv', type: 'file', depth: 3 },
  { name: 'S1E2.mkv', type: 'file', depth: 3 },
  { name: 'Season 02', type: 'folder', depth: 2 },
  { name: 'S2E1.mkv', type: 'file', depth: 3 },
  { name: 'S2E2.mkv', type: 'file', depth: 3 },

  { name: 'Show Name 2', type: 'folder', depth: 1, tag: 'series' },
  { name: 'Season 01', type: 'folder', depth: 2 },
  { name: 'S1E1.mkv', type: 'file', depth: 3 },
  { name: 'S1E2.mkv', type: 'file', depth: 3 },
];

const SECTIONS: GuideSection[] = [
  {
    icon: 'folder-open-outline',
    title: 'Add your videos',
    summary: 'Pick a folder, we do the rest',
    steps: [
      'Open Settings → Library and choose the folder holding your movies & series.',
      'WatchNow scans it, reads names, and pulls posters & info automatically.',
      'New files? Tap "Rescan library" in Settings → Index anytime.',
    ],
  },
  {
    icon: 'git-network-outline',
    title: 'Organize your folders',
    summary: 'Folder structure that scans best',
    tree: FOLDER_TREE,
    steps: [
      'Library folder: pick any folder and name it anything (My Movies, My Shows…).',
      'Movies: put video files directly inside the library folder.',
      'Series: make one folder per show, with "Season 01", "Season 02"… folders inside.',
      'Episodes: name files S1E1, S1E2… so they stay in order.',
    ],
  },
  {
    icon: 'home-outline',
    title: 'Browse on Home',
    summary: 'Rows for everything you watch',
    steps: [
      'Recently Added, Continue Watching, Favorites, Movies, Web Series, and YouTube Shows all live on the Home tab.',
      'Tap any card to open its details page, then Play.',
      'Hide rows you don’t care about via Settings → Customization.',
    ],
  },
  {
    icon: 'play-circle-outline',
    title: 'Watch & gestures',
    summary: 'Swipe, tap and hold to control',
    chips: [
      { icon: 'play-forward-outline', label: 'Double-tap', action: 'Skip ±10s' },
      { icon: 'speedometer-outline', label: 'Hold', action: '2× speed' },
      { icon: 'sunny-outline', label: 'Swipe left', action: 'Brightness' },
      { icon: 'volume-high-outline', label: 'Swipe right', action: 'Volume' },
    ],
    steps: [
      'Tap once to show controls (play, seek, audio track, subtitles, aspect ratio).',
      'Series auto-advance to the next episode near the end; progress is saved so you can resume later.',
    ],
  },
  {
    icon: 'tv-outline',
    title: 'Live TV (M3U)',
    summary: 'Stream channels from a playlist',
    links: [
      {
        label: 'Try this Hindi channels playlist',
        url: 'https://iptv-org.github.io/iptv/languages/hin.m3u',
      },
    ],
    steps: [
      'Settings → TV → TV playlists, paste an M3U/M3U8 link, and tap Add.',
      'Channels appear on the TV tab, grouped by category — search or tap the heart to save favorites.',
      'Tap any channel to stream it live (needs internet).',
    ],
  },
  {
    icon: 'logo-youtube',
    title: 'YouTube shows',
    summary: 'Turn playlists into series',
    links: [
      {
        label: 'Ramayan (sample playlist)',
        url: 'https://www.youtube.com/watch?v=RG3Hqth0Eus&list=PLFPJRCFRDARSZofcQcV6m7Pu2EAL8_1dv',
      },
      {
        label: 'Shri Krishna (sample playlist)',
        url: 'https://www.youtube.com/watch?v=oOgw-okvBMA&list=PLFPJRCFRDARR9IkjkVi6O9ue5DjKiKtkI',
      },
    ],
    steps: [
      'Settings → YouTube playlists, paste a public playlist link, and tap Add.',
      'Episodes show up in a "YouTube shows" row on Home and stream from YouTube.',
      'Open a playlist’s page and hit ↻ to refresh new episodes.',
    ],
  },
  {
    icon: 'color-wand-outline',
    title: 'Posters & artwork',
    summary: 'Fix wrong or missing posters',
    steps: [
      'Wrong poster? Open a title, tap the poster, and paste its IMDb link or ID (tt…) to fetch the right one.',
      'Settings → Artwork lets you refresh all posters and add API keys (TMDB / OMDb) for better matches.',
    ],
  },
];

function SectionCard({
  section,
  index,
  open,
  onToggle,
}: {
  section: GuideSection;
  index: number;
  open: boolean;
  onToggle: () => void;
}) {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copyLink = async (url: string) => {
    await Clipboard.setStringAsync(url);
    setCopiedUrl(url);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopiedUrl(null), 1800);
  };

  return (
    <View style={[styles.card, open && styles.cardOpen]}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.cardHeader, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}>
        <View style={styles.badge}>
          <Ionicons name={section.icon} size={20} color={colors.accent} />
          <View style={styles.badgeNum}>
            <Text style={styles.badgeNumText}>{index + 1}</Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{section.title}</Text>
          {!open && (
            <Text style={styles.cardSummary} numberOfLines={1}>
              {section.summary}
            </Text>
          )}
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.textMuted}
        />
      </Pressable>

      {open && (
        <View style={styles.cardBody}>
          {section.chips && (
            <View style={styles.chipGrid}>
              {section.chips.map((c) => (
                <View key={c.label} style={styles.chip}>
                  <Ionicons name={c.icon} size={18} color={colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.chipLabel}>{c.label}</Text>
                    <Text style={styles.chipAction}>{c.action}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {section.links?.map((link) => {
            const copied = copiedUrl === link.url;
            return (
              <View key={link.url} style={styles.linkBox}>
                <Text style={styles.linkLabel}>{link.label}</Text>
                <View style={styles.linkRow}>
                  <Text style={styles.linkUrl} selectable>
                    {link.url}
                  </Text>
                  <Pressable
                    onPress={() => copyLink(link.url)}
                    style={({ pressed }) => [
                      styles.copyBtn,
                      copied && styles.copyBtnDone,
                      pressed && { opacity: 0.7 },
                    ]}
                    accessibilityLabel={`Copy ${link.label} link`}>
                    <Ionicons
                      name={copied ? 'checkmark' : 'copy-outline'}
                      size={16}
                      color={copied ? colors.background : colors.accent}
                    />
                    <Text style={[styles.copyText, copied && { color: colors.background }]}>
                      {copied ? 'Copied' : 'Copy'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          {section.tree && (
            <View style={styles.treeBox}>
              {section.tree.map((n, i) => (
                <View key={i} style={[styles.treeRow, n.depth === 1 && n.type === 'folder' && styles.treeGap]}>
                  {Array.from({ length: n.depth }).map((_, d) => (
                    <View key={d} style={styles.treeGuide} />
                  ))}
                  <Ionicons
                    name={n.type === 'folder' ? 'folder-open' : 'videocam-outline'}
                    size={16}
                    color={n.type === 'folder' ? colors.accent : colors.textMuted}
                  />
                  <Text
                    style={[styles.treeName, n.type === 'folder' && styles.treeFolder]}
                    numberOfLines={1}>
                    {n.name}
                  </Text>
                  {n.tag && (
                    <View style={styles.treeTag}>
                      <Text style={styles.treeTagText}>{n.tag}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {section.steps.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.bullet} />
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function HowToUseScreen() {
  const insets = useSafeAreaInsets();
  const [openSet, setOpenSet] = useState<Set<number>>(new Set([0]));

  const animate = () =>
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

  const toggle = (i: number) => {
    animate();
    setOpenSet((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const allOpen = openSet.size === SECTIONS.length;
  const toggleAll = () => {
    animate();
    setOpenSet(allOpen ? new Set() : new Set(SECTIONS.map((_, i) => i)));
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.heading}>How to use</Text>
        <Pressable onPress={toggleAll} hitSlop={10}>
          <Text style={styles.toggleAll}>{allOpen ? 'Collapse all' : 'Expand all'}</Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
          paddingTop: spacing.sm,
          paddingBottom: spacing.xl + insets.bottom,
          gap: spacing.md,
        }}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="film-outline" size={26} color={colors.accent} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.heroTitle}>Welcome to WatchNow</Text>
            <Text style={styles.intro}>
              Play your own movies & series and stream live TV — everything stays on your
              device.
            </Text>
          </View>
        </View>

        <View style={styles.pillRow}>
          {[
            { icon: 'list-outline' as Icon, text: `${SECTIONS.length} quick steps` },
            { icon: 'time-outline' as Icon, text: '2 min read' },
            { icon: 'lock-closed-outline' as Icon, text: 'Private' },
          ].map((p) => (
            <View key={p.text} style={styles.pill}>
              <Ionicons name={p.icon} size={12} color={colors.textMuted} />
              <Text style={styles.pillText}>{p.text}</Text>
            </View>
          ))}
        </View>

        {SECTIONS.map((s, i) => (
          <SectionCard
            key={s.title}
            section={s}
            index={i}
            open={openSet.has(i)}
            onToggle={() => toggle(i)}
          />
        ))}

        <View style={styles.footer}>
          <Ionicons name="bulb-outline" size={16} color={colors.accent} />
          <Text style={styles.footerText}>
            Tip: you can come back to this guide anytime from Settings.
          </Text>
        </View>
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
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    flex: 1,
    color: colors.text,
    fontSize: font.title,
    fontWeight: '900',
  },
  toggleAll: {
    color: colors.accent,
    fontSize: font.body * 0.9,
    fontWeight: '700',
  },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    color: colors.text,
    fontSize: font.heading,
    fontWeight: '900',
  },
  intro: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: font.body * 1.45,
  },

  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  pillText: {
    color: colors.textMuted,
    fontSize: font.body * 0.8,
    fontWeight: '600',
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  cardOpen: {
    borderColor: colors.accent,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeNum: {
    position: 'absolute',
    top: -6,
    left: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeNumText: {
    color: colors.background,
    fontSize: 10,
    fontWeight: '900',
  },
  cardTitle: {
    color: colors.text,
    fontSize: font.heading,
    fontWeight: '800',
  },
  cardSummary: {
    color: colors.textMuted,
    fontSize: font.body * 0.88,
    marginTop: 2,
  },
  cardBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },

  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '48.5%',
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.textMuted,
  },
  chipLabel: {
    color: colors.text,
    fontSize: font.body * 0.88,
    fontWeight: '700',
  },
  chipAction: {
    color: colors.textMuted,
    fontSize: font.body * 0.8,
  },

  linkBox: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 6,
    marginBottom: spacing.xs,
  },
  linkLabel: {
    color: colors.textMuted,
    fontSize: font.body * 0.8,
    fontWeight: '700',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  linkUrl: {
    flex: 1,
    color: colors.text,
    fontSize: font.body * 0.82,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  copyBtnDone: {
    backgroundColor: colors.accent,
  },
  copyText: {
    color: colors.accent,
    fontSize: font.body * 0.85,
    fontWeight: '800',
  },

  treeBox: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  treeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
  },
  treeGap: {
    marginTop: spacing.sm,
  },
  treeGuide: {
    width: 14,
    alignSelf: 'stretch',
    marginLeft: 4,
    borderLeftWidth: 1,
    borderLeftColor: colors.textMuted,
    opacity: 0.5,
  },
  treeName: {
    color: colors.textSecondary,
    fontSize: font.body * 0.9,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    flexShrink: 1,
  },
  treeFolder: {
    color: colors.text,
    fontWeight: '700',
  },
  treeTag: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  treeTagText: {
    color: colors.accent,
    fontSize: font.body * 0.7,
    fontWeight: '700',
  },

  stepRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: font.body * 0.6,
  },
  stepText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: font.body,
    lineHeight: font.body * 1.5,
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: font.body * 0.85,
    flexShrink: 1,
  },
});