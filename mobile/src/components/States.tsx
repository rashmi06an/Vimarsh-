import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme';
import { Text } from './Text';
import { Button } from './Button';
import { t } from '../i18n';

/** Centered loading spinner. */
export function LoadingState({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
      {!!label && (
        <Text variant="body" color={colors.textMuted} style={styles.gap}>
          {label}
        </Text>
      )}
    </View>
  );
}

/** Empty state with a title and optional hint. */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.center}>
      <View style={styles.dot} />
      <Text variant="heading" center>
        {title}
      </Text>
      {!!hint && (
        <Text variant="body" color={colors.textMuted} center style={styles.gap}>
          {hint}
        </Text>
      )}
    </View>
  );
}

/** Error state with a retry action. */
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text variant="heading" color={colors.danger} center>
        {t('common.somethingWrong')}
      </Text>
      <Text variant="body" color={colors.textMuted} center style={styles.gap}>
        {message ?? t('errors.generic')}
      </Text>
      {onRetry && (
        <View style={styles.retry}>
          <Button title={t('common.retry')} variant="outline" onPress={onRetry} fullWidth={false} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  gap: { marginTop: spacing.sm },
  retry: { marginTop: spacing.lg },
  dot: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
});
