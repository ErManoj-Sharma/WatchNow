import { StyleSheet, Text, View } from 'react-native';

import { colors, font, spacing } from '@/theme/colors';

export function ProgressBar({ positionMs, durationMs }: { positionMs: number | null; durationMs: number | null }) {
  if (positionMs == null || durationMs == null || durationMs <= 0) return null;
  const pct = Math.min(100, Math.max(2, (positionMs / durationMs) * 100));
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%` }]} />
    </View>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.progressTrack,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowLabel: {
    color: colors.textSecondary,
    fontSize: font.caption,
  },
  rowValue: {
    color: colors.text,
    fontSize: font.caption,
    flexShrink: 1,
    textAlign: 'right',
  },
});
