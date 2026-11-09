import React from 'react';
import { Text as RNText, TextProps, StyleSheet, TextStyle } from 'react-native';
import { colors, typography } from '../theme';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'devanagari';

interface Props extends TextProps {
  variant?: Variant;
  color?: string;
  center?: boolean;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
}

const variantStyle: Record<Variant, TextStyle> = {
  display: { fontSize: typography.size.xxl, fontFamily: typography.fontFamily.bold },
  title: { fontSize: typography.size.xl, fontFamily: typography.fontFamily.bold },
  heading: { fontSize: typography.size.lg, fontFamily: typography.fontFamily.semibold },
  body: { fontSize: typography.size.body, fontFamily: typography.fontFamily.regular },
  label: { fontSize: typography.size.sm, fontFamily: typography.fontFamily.semibold },
  caption: { fontSize: typography.size.xs, fontFamily: typography.fontFamily.regular },
  devanagari: { fontSize: typography.size.xxl, fontFamily: typography.fontFamily.devanagari },
};

const weightFamily = {
  regular: typography.fontFamily.regular,
  medium: typography.fontFamily.medium,
  semibold: typography.fontFamily.semibold,
  bold: typography.fontFamily.bold,
};

/** Typographic component with consistent hierarchy (body >= 16px). */
export function Text({ variant = 'body', color, center, weight, style, ...rest }: Props) {
  return (
    <RNText
      style={[
        variantStyle[variant],
        { color: color ?? colors.text },
        center && styles.center,
        weight && { fontFamily: weightFamily[weight] },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({ center: { textAlign: 'center' } });
