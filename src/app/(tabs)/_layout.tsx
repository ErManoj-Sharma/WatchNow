import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { colors } from '@/theme/colors';

export default function TabsLayout() {
  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.surfaceRaised}
      labelVisibilityMode="unlabeled">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search">
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf="gearshape.fill" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
