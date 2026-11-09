import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';
import { Text } from './Text';

type Variant = 'primary' | 'accent' | 'outline' | 'danger' | 'ghost';

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  fullWidth?: boolean;
}

/**
 * Primary CTA uses saffron accent (sparingly). Navy for standard, outline/ghost for secondary,
 * red only for destructive. Touch target >= 48px for accessibility.
 */
export function Button({ title, onPress, variant = 'primary', loading, disabled, style, fullWidth = true }: Props) {
  const isDisabled = !!(disabled || loading);
  const palette = getPalette(variant, isDisabled);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        { backgroundColor: palette.bg, borderColor: palette.border },
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Text style={{ color: palette.fg, fontFamily: typography.fontFamily.semibold, fontSize: typography.size.body }}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

function getPalette(variant: Variant, disabled: boolean) {
  if (disabled) return { bg: '#C7CEDB', fg: '#FFFFFF', border: '#C7CEDB' };
  switch (variant) {
    case 'accent':
      return { bg: colors.accent, fg: '#FFFFFF', border: colors.accent };
    case 'outline':
      return { bg: 'transparent', fg: colors.primary, border: colors.border };
    case 'danger':
      return { bg: colors.danger, fg: '#FFFFFF', border: colors.danger };
    case 'ghost':
      return { bg: 'transparent', fg: colors.primary, border: 'transparent' };
    case 'primary':
    default:
      return { bg: colors.primary, fg: '#FFFFFF', border: colors.primary };
  }
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  fullWidth: { alignSelf: 'stretch' },
  pressed: { opacity: 0.85 },
});
