import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { colors, font, radius, spacing } from '@/theme/colors';

export function Button({
  label,
  onPress,
  variant = 'primary',
  style,
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  style?: ViewStyle;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        pressed && { opacity: 0.7 },
        disabled && { opacity: 0.4 },
        style,
      ]}>
      <Text
        style={[
          styles.label,
          variant === 'ghost' && { color: colors.textSecondary },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.accent,
  },
  secondary: {
    backgroundColor: colors.surfaceHover,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  label: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
});
