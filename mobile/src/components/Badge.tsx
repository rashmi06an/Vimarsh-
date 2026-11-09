import React from 'react';
import { StyleSheet, View } from 'react-native';
import { radius, roleBadge, confidentiality, spacing, typography } from '../theme';
import { Text } from './Text';

/** Role badge with the consistent brand color for each role. */
export function RoleBadge({ role }: { role: string }) {
  const b = roleBadge[role] ?? roleBadge.GUEST;
  return (
    <View style={[styles.badge, { backgroundColor: b.bg }]}>
      <Text style={[styles.text, { color: b.fg }]}>{b.label}</Text>
    </View>
  );
}

/** Confidentiality label (Public / Internal / Confidential / Restricted). */
export function ConfidentialityBadge({ level }: { level: string }) {
  const c = confidentiality[level] ?? confidentiality.INTERNAL;
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.fg }]}>{c.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  text: { fontSize: typography.size.xs, fontFamily: typography.fontFamily.semibold },
});
