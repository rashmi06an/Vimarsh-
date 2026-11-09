import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { colors, radius, spacing } from '../../theme';
import { t } from '../../i18n';
import { useAuth } from '../../auth/AuthContext';

export function ApplicationStatusScreen() {
  const { user, refreshProfile, signOut } = useAuth();
  const [checking, setChecking] = useState(false);
  const rejected = user?.status === 'REJECTED';

  const check = async () => {
    setChecking(true);
    await refreshProfile();
    setChecking(false);
  };

  return (
    <Screen>
      <View style={styles.wrap}>
        <View style={[styles.statusDot, { backgroundColor: rejected ? colors.danger : colors.warning }]} />
        <Text variant="title" center>
          {rejected ? t('status.rejectedTitle') : t('status.pendingTitle')}
        </Text>
        <Text variant="body" color={colors.textMuted} center style={styles.body}>
          {rejected ? t('status.rejectedBody') : t('status.pendingBody')}
        </Text>

        {rejected && !!user?.rejectionReason && (
          <Card style={styles.reasonCard}>
            <Text variant="label" color={colors.textMuted}>{t('status.reasonLabel')}</Text>
            <Text variant="body" color={colors.danger} style={styles.reason}>{user.rejectionReason}</Text>
          </Card>
        )}

        <Card style={styles.infoCard}>
          <Row label={t('common.email')} value={user?.email ?? '—'} />
          <Row label={t('org.organization')} value={user?.org?.name ?? '—'} />
          <Row label={t('org.designation')} value={user?.designation ?? '—'} />
        </Card>

        {!rejected && (
          <Button title={t('status.checkAgain')} variant="accent" onPress={check} loading={checking} />
        )}
        <Button title={t('common.signOut')} variant="ghost" onPress={signOut} />
      </View>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="caption" color={colors.textMuted}>{label}</Text>
      <Text variant="body" weight="medium">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  statusDot: { width: 56, height: 56, borderRadius: 28, marginBottom: spacing.lg },
  body: { marginTop: spacing.sm, marginBottom: spacing.lg, maxWidth: 320 },
  reasonCard: { alignSelf: 'stretch', marginBottom: spacing.lg, borderColor: colors.danger },
  reason: { marginTop: spacing.xs },
  infoCard: { alignSelf: 'stretch', marginBottom: spacing.xl, gap: spacing.md },
  row: { gap: 2 },
});
