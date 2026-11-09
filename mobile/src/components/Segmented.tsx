import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { Text } from './Text';

interface Props<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}

/** Horizontal segmented control; the active segment uses the saffron accent underline. */
export function Segmented<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={styles.item}>
            <Text variant="label" color={active ? colors.primary : colors.textMuted}>{o.label}</Text>
            <View style={[styles.underline, active && styles.underlineActive]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: spacing.sm, gap: spacing.lg, paddingRight: spacing.lg },
  item: { alignItems: 'center' },
  underline: { height: 3, width: '100%', marginTop: 6, borderRadius: 2, backgroundColor: 'transparent' },
  underlineActive: { backgroundColor: colors.accent },
});
