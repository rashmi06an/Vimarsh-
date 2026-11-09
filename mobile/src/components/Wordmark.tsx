import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, typography } from '../theme';
import { Text } from './Text';

interface Props {
  size?: 'sm' | 'md' | 'lg';
  onDark?: boolean;
  showTagline?: boolean;
}

/**
 * Vimarsh wordmark: विमर्श (Devanagari) above "AICTE Vimarsh".
 * Text-based branding only — no State Emblem / Ashoka Chakra (legally restricted).
 */
export function Wordmark({ size = 'md', onDark = false, showTagline = false }: Props) {
  const devSize = size === 'lg' ? 52 : size === 'md' ? 40 : 30;
  const nameSize = size === 'lg' ? typography.size.lg : typography.size.md;
  const primary = onDark ? '#FFFFFF' : colors.primary;
  const muted = onDark ? 'rgba(255,255,255,0.85)' : colors.textMuted;

  return (
    <View style={styles.wrap}>
      <Text style={{ fontFamily: typography.fontFamily.devanagari, fontSize: devSize, color: primary }}>
        विमर्श
      </Text>
      <View style={styles.row}>
        <View style={[styles.tick, { backgroundColor: colors.accent }]} />
        <Text style={{ fontFamily: typography.fontFamily.bold, fontSize: nameSize, color: primary, letterSpacing: 0.5 }}>
          AICTE Vimarsh
        </Text>
      </View>
      {showTagline && (
        <Text variant="body" color={muted} center style={styles.tagline}>
          Secure meetings for India’s technical education.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  tick: { width: 10, height: 10, borderRadius: 2, marginRight: 8, transform: [{ rotate: '45deg' }] },
  tagline: { marginTop: 10, maxWidth: 300 },
});
