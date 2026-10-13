import '@/global.css';

import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { getDb } from '@/db/database';
import { colors } from '@/theme/colors';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const finish = () => {
      setReady(true);
      SplashScreen.hideAsync().catch(() => undefined);
    };
    getDb()
      .then(finish)
      .catch(finish);
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
        <Stack.Screen name="search" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="player" options={{ animation: 'fade' }} />
        <Stack.Screen name="youtube-player" options={{ animation: 'fade' }} />
      </Stack>
    </>
  );
}
