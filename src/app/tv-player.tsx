import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import { router, useLocalSearchParams } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, font, spacing } from '@/theme/colors';

// Distinguish "no internet" from "stream dead/geo-blocked": if the device can
// reach the URL, the failure is the stream itself. HEAD is enough; some servers
// reject it (405) but answering at all means the network path works.
async function probeReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(6000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

export default function TvPlayerScreen() {
  const { stream, name } = useLocalSearchParams<{ stream: string; name: string }>();
  const insets = useSafeAreaInsets();
  const [error, setError] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);

  const player = useVideoPlayer(String(stream ?? ''), (p) => {
    p.keepScreenOnWhilePlaying = true;
    p.play();
  });

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => undefined);
    return () => {
      ScreenOrientation.unlockAsync().catch(() => undefined);
    };
  }, []);

  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'error') {
      setProbing(true);
      setError(null);
      probeReachable(String(stream ?? ''))
        .then((ok) => {
          setError(
            ok
              ? 'Stream unavailable — this channel may be dead or geo-blocked.'
              : 'No internet connection.',
          );
        })
        .finally(() => setProbing(false));
      return;
    }
    if (status === 'readyToPlay') setError(null);
  });

  const retry = () => {
    setError(null);
    player.replaceAsync(String(stream ?? '')).then(() => player.play()).catch(() => setError('Could not load the stream.'));
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls={false}
        contentFit="contain"
        fullscreenOptions={{ enable: false }}
      />
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => (player.playing ? player.pause() : player.play())}
      />

      {/* TOP BAR */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.xs }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {name ?? 'Live TV'}
        </Text>
        <View style={{ width: 38 }} />
      </View>

      {/* ERROR OVERLAY */}
      {error || probing ? (
        <View style={styles.errorOverlay} pointerEvents="box-none">
          <View style={styles.errorCard}>
            {probing ? (
              <ActivityIndicator size="large" color={colors.accent} />
            ) : (
              <>
                <Ionicons
                  name={error?.includes('internet') ? 'cloud-offline-outline' : 'alert-circle-outline'}
                  size={40}
                  color={colors.textSecondary}
                />
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={retry} style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]}>
                  <Ionicons name="refresh" size={16} color="#000" />
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: font.heading,
    fontWeight: '800',
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: spacing.lg,
  },
  errorCard: {
    alignItems: 'center',
    gap: spacing.md,
    maxWidth: 360,
  },
  errorText: {
    color: colors.text,
    fontSize: font.body,
    textAlign: 'center',
    fontWeight: '600',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  retryText: {
    color: '#000',
    fontSize: font.body,
    fontWeight: '800',
  },
});
