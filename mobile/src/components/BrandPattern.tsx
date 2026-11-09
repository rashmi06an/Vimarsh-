import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';

/**
 * Subtle original geometric mark — a row of small rotated diamonds.
 * Used ONLY on Welcome and Splash (nothing decorative elsewhere).
 * Original shape (no official emblem).
 */
export function BrandPattern({ onDark = false }: { onDark?: boolean }) {
  const tint = onDark ? 'rgba(232,135,30,0.5)' : 'rgba(27,47,91,0.12)';
  return (
    <View style={styles.row} pointerEvents="none">
      {Array.from({ length: 11 }).map((_, i) => (
        <View key={i} style={[styles.diamond, { backgroundColor: i % 3 === 0 ? colors.accent : tint }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  diamond: {
    width: 8,
    height: 8,
    marginHorizontal: 5,
    transform: [{ rotate: '45deg' }],
    borderRadius: 1,
  },
});
