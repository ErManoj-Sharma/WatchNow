import '@/global.css';

import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { getDb } from '@/db/database';
import { colors } from '@/theme/colors';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    getDb()
      .then(() => setReady(true))
      .catch(() => setReady(true));
  }, []);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="player" options={{ animation: 'fade' }} />
        <Stack.Screen name="youtube-player" options={{ animation: 'fade' }} />
      </Stack>
    </>
  );
}
