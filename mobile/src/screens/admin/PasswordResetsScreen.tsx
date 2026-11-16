import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { colors, radius, spacing } from '../../theme';
import { t } from '../../i18n';
import { passwordResetsApi } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import type { ApprovedReset, PendingResetItem } from '../../api/types';

function when(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function PasswordResetsScreen() {
  const qc = useQueryClient();
  const [issued, setIssued] = useState<ApprovedReset | null>(null);

  const pending = useQuery({ queryKey: ['password-resets'], queryFn: () => passwordResetsApi.pending() });

  const approve = useMutation({
    mutationFn: (id: string) => passwordResetsApi.approve(id),
    onSuccess: (res) => {
      setIssued(res);
      qc.invalidateQueries({ queryKey: ['password-resets'] });
    },
    onError: (e) => Alert.alert('Could not approve', e instanceof ApiError ? e.message : 'Please try again.'),
  });

  const reject = useMutation({
    mutationFn: (id: string) => passwordResetsApi.reject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['password-resets'] }),
    onError: (e) => Alert.alert('Could not reject', e instanceof ApiError ? e.message : 'Please try again.'),
  });

  const confirmReject = (id: string) =>
    Alert.alert(t('resets.reject'), t('resets.rejectConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('resets.reject'), style: 'destructive', onPress: () => reject.mutate(id) },
    ]);

  const rows = pending.data ?? [];

  return (
    <Screen scroll>
      <Text variant="body" color={colors.textMuted} style={styles.subtitle}>
        {t('resets.subtitle')}
      </Text>

      {/* Freshly issued code — shown once */}
      {issued && (
        <Card style={[styles.block, styles.codeCard]}>
          <Text variant="body" weight="semibold">{t('resets.codeTitle')}</Text>
          <Text variant="caption" color={colors.textMuted} style={styles.codeFor}>
            {t('resets.codeFor', { name: issued.fullName, email: issued.email })}
          </Text>
          <Text selectable variant="title" center style={styles.code}>{issued.code}</Text>
          <Text variant="caption" color={colors.textSubtle} center>{t('resets.codeHint')}</Text>
          <Text variant="caption" color={colors.textMuted} center style={styles.expires}>
            {t('resets.expires', { when: when(issued.expiresAt) })}
          </Text>
          <Button title={t('resets.done')} variant="ghost" onPress={() => setIssued(null)} />
        </Card>
      )}

      {rows.length === 0 ? (
        <Text variant="caption" color={colors.textMuted}>{t('resets.empty')}</Text>
      ) : (
        rows.map((r) => (
          <ResetRow
            key={r.id}
            item={r}
            busy={approve.isPending || reject.isPending}
            onApprove={() => approve.mutate(r.id)}
            onReject={() => confirmReject(r.id)}
          />
        ))
      )}
    </Screen>
  );
}

function ResetRow({
  item,
  busy,
  onApprove,
  onReject,
}: {
  item: PendingResetItem;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <Card style={styles.row}>
      <Text variant="body" weight="semibold">{item.fullName || item.email}</Text>
      <Text variant="caption" color={colors.textMuted}>{item.email}</Text>
      <Text variant="caption" color={colors.textSubtle} style={styles.reqAt}>
        {t('resets.requestedAt', { when: when(item.requestedAt) })}
      </Text>
      <View style={styles.actions}>
        <Button title={t('resets.approve')} variant="accent" onPress={onApprove} disabled={busy} />
        <Button title={t('resets.reject')} variant="outline" onPress={onReject} disabled={busy} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  subtitle: { marginTop: spacing.sm, marginBottom: spacing.md },
  block: { marginBottom: spacing.md },
  codeCard: { borderWidth: 1, borderColor: colors.accent },
  codeFor: { marginTop: spacing.xs, marginBottom: spacing.md },
  code: { letterSpacing: 2, marginBottom: spacing.xs },
  expires: { marginTop: spacing.sm, marginBottom: spacing.sm },
  row: { marginBottom: spacing.sm },
  reqAt: { marginTop: 2, marginBottom: spacing.sm },
  actions: { gap: spacing.sm },
});
