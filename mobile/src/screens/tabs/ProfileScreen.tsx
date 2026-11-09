import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { RoleBadge } from '../../components/Badge';
import { colors, spacing } from '../../theme';
import { t } from '../../i18n';
import { useAuth } from '../../auth/AuthContext';
import { usersApi, authApi } from '../../api/endpoints';

interface SessionRow { id: string; deviceInfo: string | null; createdAt: string; expiresAt: string }

export function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  const load = useCallback(async () => {
    try {
      setSessions(await usersApi.sessions());
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (id: string) => {
    try {
      await usersApi.revokeSession(id);
      load();
    } catch {
      Alert.alert('Could not revoke session');
    }
  };

  const confirmDestructive = (title: string, message: string, onConfirm: () => void) => {
    Alert.alert(title, message, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: title, style: 'destructive', onPress: onConfirm },
    ]);
  };

  const deactivate = () => confirmDestructive('Deactivate account', 'Your account will be suspended and you will be signed out. An administrator can reactivate it.', async () => {
    try { await usersApi.deactivate(); await signOut(); } catch { Alert.alert(t('errors.generic')); }
  });

  const deleteAccount = () => confirmDestructive('Delete account & data', 'This permanently removes your personal data and cannot be undone.', async () => {
    try { await usersApi.deleteAccount(); await signOut(); } catch { Alert.alert(t('errors.generic')); }
  });

  const changePassword = () => {
    if (!user?.email) return;
    Alert.alert(
      t('profile.changePassword'),
      'We will email you a reset code (printed to the backend console in dev).',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.continue'),
          onPress: async () => {
            try {
              await authApi.forgotPassword(user.email);
              Alert.alert('Reset code sent', 'Check your email (or the backend console in dev).');
            } catch {
              Alert.alert(t('errors.generic'));
            }
          },
        },
      ],
    );
  };

  return (
    <Screen scroll>
      <Text variant="title" style={styles.title}>{t('profile.title')}</Text>

      <Card style={styles.card}>
        <View style={styles.idRow}>
          <View style={{ flex: 1 }}>
            <Text variant="heading">{user?.fullName}</Text>
            <Text variant="body" color={colors.textMuted}>{user?.email}</Text>
          </View>
          {user?.role && <RoleBadge role={user.role} />}
        </View>
      </Card>

      <Text variant="label" color={colors.textMuted} style={styles.sectionLbl}>{t('profile.institution').toUpperCase()}</Text>
      <Card style={styles.card}>
        <Row label={t('org.organization')} value={user?.org?.name ?? '—'} />
        <Row label={t('org.department')} value={user?.department?.name ?? '—'} />
        <Row label={t('profile.designation')} value={user?.designation ?? '—'} />
      </Card>

      <Text variant="label" color={colors.textMuted} style={styles.sectionLbl}>{t('profile.sessions').toUpperCase()}</Text>
      <Card style={styles.card}>
        {sessions.length === 0 ? (
          <Text variant="body" color={colors.textMuted}>No other active sessions.</Text>
        ) : (
          sessions.map((s) => (
            <View key={s.id} style={styles.sessionRow}>
              <View style={{ flex: 1 }}>
                <Text variant="body" weight="medium">{s.deviceInfo ?? 'Unknown device'}</Text>
                <Text variant="caption" color={colors.textMuted}>
                  Since {new Date(s.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <Button title="Revoke" variant="outline" fullWidth={false} onPress={() => revoke(s.id)} />
            </View>
          ))
        )}
      </Card>

      <View style={styles.actions}>
        <Button title={t('profile.changePassword')} variant="outline" onPress={changePassword} />
        <View style={styles.gap} />
        <Button title={t('common.signOut')} variant="danger" onPress={signOut} />
      </View>

      <Text variant="label" color={colors.textMuted} style={styles.sectionLbl}>PRIVACY</Text>
      <Card style={styles.card}>
        <Button title="Deactivate account" variant="ghost" onPress={deactivate} />
        <Button title="Delete account & data" variant="ghost" onPress={deleteAccount} />
      </Card>
      <View style={styles.bottomGap} />
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
  title: { marginTop: spacing.md, marginBottom: spacing.lg },
  card: { marginBottom: spacing.lg, gap: spacing.md },
  idRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  sectionLbl: { marginBottom: spacing.sm, letterSpacing: 0.6 },
  row: { gap: 2 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { marginTop: spacing.sm, marginBottom: spacing.lg },
  gap: { height: spacing.sm },
  bottomGap: { height: spacing.xxl },
});
