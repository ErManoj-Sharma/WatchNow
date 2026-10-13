import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBlurTarget } from '@/lib/blur';
import { colors } from '@/theme/colors';

function TabBarBackground() {
  const target = useBlurTarget();
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 56, overflow: 'hidden' }}>
        <BlurView
          intensity={25}
          tint="dark"
          blurMethod="dimezisBlurViewSdk31Plus"
          blurTarget={{ current: target }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(1, 1, 1, 0.57)' }]} />
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopColor: colors.border,
          borderTopWidth: 0,
          position: 'absolute',
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarBackground: TabBarBackground,
        tabBarLabelStyle: { display: 'none' },
        tabBarIconStyle: { marginTop: 4 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarAccessibilityLabel: 'Home',
          tabBarIcon: ({ color }) => <Ionicons name="home" color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarAccessibilityLabel: 'Settings',
          tabBarIcon: ({ color }) => <Ionicons name="settings" color={color} size={24} />,
        }}
      />
    </Tabs>
  );
}
