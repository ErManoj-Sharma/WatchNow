import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { font, radius } from '@/theme/colors';
import { useThumbnail } from '@/features/library/thumbnails';

const PLACEHOLDER_TINTS = ['#3d0a0e', '#1a2744', '#2b1f3d', '#1f3328', '#3d2f0a', '#0f2f33'];

function tintFor(key: number): string {
  return PLACEHOLDER_TINTS[Math.abs(key) % PLACEHOLDER_TINTS.length];
}

export function Thumb({
  mediaId,
  uri,
  width,
  height,
  title,
  borderRadius = radius.md,
}: {
  mediaId?: number | null;
  uri?: string | null;
  width: number;
  height: number;
  title?: string;
  borderRadius?: number;
}) {
  const path = useThumbnail(mediaId ?? null, uri ?? null);
  const initial = (title ?? '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <View style={[styles.box, { width, height, borderRadius, backgroundColor: tintFor((mediaId ?? title?.charCodeAt(0) ?? 0) as number) }]}>
      {path ? (
        <Image
          source={{ uri: path }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          onError={(error) => console.warn('WatchNow: thumbnail image failed to load', path, error)}
        />
      ) : (
        <Text style={styles.initial}>{initial}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: font.title,
    fontWeight: '700',
  },
});
