import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { RoleBadge } from '../../components/Badge';
import { colors, spacing } from '../../theme';
import { approvalsApi, passwordResetsApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthContext';
import type { AdminStackParams } from '../../navigation/types';

type Props = NativeStackScreenProps<AdminStackParams, 'AdminHome'>;

export function AdminHomeScreen({ navigation }: Props) {
  const { user } = useAuth();
  const pending = useQuery({ queryKey: ['approvals'], queryFn: () => approvalsApi.pending() });
  const count = pending.data?.length ?? 0;
  const resets = useQuery({ queryKey: ['password-resets'], queryFn: () => passwordResetsApi.pending() });
  const resetCount = resets.data?.length ?? 0;

  return (
    <Screen scroll>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text variant="title">Administration</Text>
          <Text variant="caption" color={colors.textMuted}>{user?.org?.name}</Text>
        </View>
        {user?.role && <RoleBadge role={user.role} />}
      </View>

      <Tile icon="qr-code-outline" title="Member invitations" subtitle="Generate one-time QR onboarding codes" onPress={() => navigation.navigate('Invites')} />
      <Tile icon="checkmark-done-outline" title="Registration approvals" subtitle={count > 0 ? `${count} pending` : 'No pending'} onPress={() => navigation.navigate('Approvals')} badge={count} />
      <Tile icon="people-outline" title="Members & access" subtitle="Revoke or restore member access" onPress={() => navigation.navigate('Members')} />
      <Tile icon="key-outline" title="Password resets" subtitle={resetCount > 0 ? `${resetCount} pending` : 'No pending'} onPress={() => navigation.navigate('PasswordResets')} badge={resetCount} />
      <Tile icon="shield-checkmark-outline" title="Audit log" subtitle="Hash-chained · verify integrity" onPress={() => navigation.navigate('AuditLog')} />
    </Screen>
  );
}

function Tile({ icon, title, subtitle, onPress, badge }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; onPress: () => void; badge?: number }) {
  return (
    <Card onPress={onPress} style={styles.tile}>
      <View style={styles.iconWrap}><Ionicons name={icon} size={24} color={colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text variant="body" weight="semibold">{title}</Text>
        <Text variant="caption" color={colors.textMuted}>{subtitle}</Text>
      </View>
      {!!badge && badge > 0 && <View style={styles.badge}><Text variant="caption" color="#fff">{badge}</Text></View>}
      <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.md, marginBottom: spacing.lg, gap: spacing.sm },
  tile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});
