import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { useScanState, cancelScan } from '@/features/scanner/scan-store';
import { colors, font, radius, spacing } from '@/theme/colors';

export function ScanIndicator() {
  const scan = useScanState();
  if (scan.status !== 'scanning' && scan.status !== 'indexing') {
    if (scan.status === 'error' && scan.errors.length > 0) {
      return (
        <View style={styles.banner}>
          <Text style={styles.errorText}>Scan failed: {scan.errors[scan.errors.length - 1]}</Text>
        </View>
      );
    }
    return null;
  }
  return (
    <View style={styles.banner}>
      <View style={styles.row}>
        <Text style={styles.title}>{scan.status === 'indexing' ? 'Indexing library…' : 'Scanning folder…'}</Text>
        <Button label="Cancel" variant="ghost" onPress={cancelScan} style={styles.cancel} />
      </View>
      <Text style={styles.meta}>
        {scan.directoriesVisited} folders · {scan.filesDiscovered} videos · {scan.filesIndexed} indexed
        {scan.errorCount > 0 ? ` · ${scan.errorCount} errors` : ''}
      </Text>
      {scan.currentPath ? (
        <Text style={styles.path} numberOfLines={1}>
          {scan.currentPath}
        </Text>
      ) : null}
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  cancel: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: font.caption,
    marginTop: 2,
  },
  path: {
    color: colors.textMuted,
    fontSize: font.small,
    marginTop: 2,
  },
  errorText: {
    color: colors.warning,
    fontSize: font.caption,
  },
});
