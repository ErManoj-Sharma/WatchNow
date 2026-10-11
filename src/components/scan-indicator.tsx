import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { cancelScan, useScanState } from '@/features/scanner/scan-store';
import { colors, font, radius, spacing } from '@/theme/colors';

const SWEEP_MS = 900;

function IndeterminateBar() {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    progress.set(withRepeat(withTiming(1, { duration: SWEEP_MS, easing: Easing.linear }), -1, false));
  }, [progress, reduced]);

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: `${-100 + progress.get() * 385}%` }],
  }));

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, fillStyle]} />
    </View>
  );
}

function CancelPill() {
  return (
    <Pressable
      onPress={cancelScan}
      hitSlop={8}
      style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.6 }]}>
      <Text style={styles.cancelText}>Cancel</Text>
    </Pressable>
  );
}

export function ScanIndicator() {
  const scan = useScanState();

  if (scan.status === 'error' && scan.errors.length > 0) {
    return (
      <View style={[styles.banner, styles.errorBanner]}>
        <Ionicons name="warning-outline" size={16} color={colors.warning} style={{ marginTop: 1 }} />
        <Text style={styles.errorText}>Scan failed: {scan.errors[scan.errors.length - 1]}</Text>
      </View>
    );
  }

  if (scan.status !== 'scanning' && scan.status !== 'indexing') {
    return null;
  }

  return (
    <View style={styles.banner}>
      <View style={styles.headerRow}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={styles.title}>
          {scan.status === 'indexing' ? 'Indexing library…' : 'Scanning folder…'}
        </Text>
        <CancelPill />
      </View>
      <Text style={styles.meta}>
        <Text style={styles.metaStrong}>{scan.directoriesVisited}</Text> folders ·{' '}
        <Text style={styles.metaStrong}>{scan.filesDiscovered}</Text> videos ·{' '}
        <Text style={styles.metaStrong}>{scan.filesIndexed}</Text> indexed
        {scan.errorCount > 0 ? (
          <>
            {' · '}
            <Text style={styles.metaError}>{scan.errorCount} errors</Text>
          </>
        ) : null}
      </Text>
      {scan.currentPath ? (
        <Text style={styles.path} numberOfLines={1}>
          {scan.currentPath}
        </Text>
      ) : null}
      <IndeterminateBar />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderLeftColor: colors.warning,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  cancel: {
    backgroundColor: colors.surfaceHover,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  meta: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.sm,
  },
  metaStrong: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  metaError: {
    color: colors.warning,
    fontWeight: '700',
  },
  path: {
    color: colors.textMuted,
    fontSize: font.small,
    marginTop: 2,
  },
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.progressTrack,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '35%',
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  errorText: {
    flex: 1,
    color: colors.warning,
    fontSize: font.caption,
    lineHeight: font.caption * 1.4,
  },
});
