import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { QrImage } from '../../components/QrImage';
import { colors, radius, spacing } from '../../theme';
import { t } from '../../i18n';
import { invitesApi } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { CreatedInvite, InviteListItem, InviteState, Role } from '../../api/types';

// Roles an admin may grant via an invite, by their own role (mirrors the backend).
// A super admin can onboard ministry/institute admins; others cannot grant admin roles.
const grantableRoles = (actorRole?: string): Role[] =>
  actorRole === 'SUPER_ADMIN'
    ? ['MINISTRY', 'INSTITUTE_ADMIN', 'HOD', 'FACULTY', 'GUEST']
    : ['HOD', 'FACULTY', 'GUEST'];

const STATUS_COLOR: Record<InviteState, string> = {
  ACTIVE: colors.success,
  REDEEMED: colors.textMuted,
  REVOKED: colors.danger,
  EXPIRED: colors.textSubtle,
};

function when(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function InvitesScreen() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const ROLES = grantableRoles(user?.role);
  const [role, setRole] = useState<Role>('FACULTY');
  const [note, setNote] = useState('');
  const [created, setCreated] = useState<CreatedInvite | null>(null);

  const list = useQuery({ queryKey: ['invites'], queryFn: () => invitesApi.list() });

  const create = useMutation({
    mutationFn: () => invitesApi.create({ role, note: note.trim() || undefined }),
    onSuccess: (inv) => {
      setCreated(inv);
      setNote('');
      qc.invalidateQueries({ queryKey: ['invites'] });
    },
    onError: (e) => Alert.alert('Could not generate', e instanceof ApiError ? e.message : 'Please try again.'),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => invitesApi.revoke(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invites'] }),
    onError: (e) => Alert.alert('Could not revoke', e instanceof ApiError ? e.message : 'Please try again.'),
  });

  const confirmRevoke = (id: string) =>
    Alert.alert(t('invite.revoke'), t('invite.revokeConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('invite.revoke'), style: 'destructive', onPress: () => revoke.mutate(id) },
    ]);

  const rows = list.data ?? [];

  return (
    <Screen scroll>
      <Text variant="body" color={colors.textMuted} style={styles.subtitle}>
        {t('invite.subtitle')}
      </Text>

      {/* Generate */}
      <Card style={styles.block}>
        <Text variant="label" color={colors.textMuted}>{t('invite.role')}</Text>
        <View style={styles.chips}>
          {ROLES.map((r) => (
            <Pressable
              key={r}
              onPress={() => setRole(r)}
              style={[styles.chip, role === r && styles.chipActive]}
            >
              <Text variant="caption" color={role === r ? '#FFFFFF' : colors.primary}>{r}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.gap} />
        <TextField label={t('invite.note')} value={note} onChangeText={setNote} placeholder={t('invite.notePlaceholder')} autoCapitalize="words" />
        <Button title={t('invite.generate')} variant="accent" onPress={() => create.mutate()} loading={create.isPending} />
      </Card>

      {/* Freshly created invite — QR + code, shown once */}
      {created && (
        <Card style={[styles.block, styles.newInvite]}>
          <Text variant="body" weight="semibold">{t('invite.newCode')}</Text>
          <Text variant="caption" color={colors.textMuted} style={styles.showQr}>{t('invite.showQr')}</Text>
          <View style={styles.qrWrap}>
            <QrImage value={created.code} size={210} />
          </View>
          <Text selectable variant="title" center style={styles.code}>{created.code}</Text>
          <Text variant="caption" color={colors.textSubtle} center>{t('invite.copyHint')}</Text>
          <View style={styles.metaRow}>
            <RolePill role={created.role} />
            <Text variant="caption" color={colors.textMuted}>{t('invite.expires', { when: when(created.expiresAt) })}</Text>
          </View>
          <Button title={t('common.cancel')} variant="ghost" onPress={() => setCreated(null)} />
        </Card>
      )}

      {/* Existing invites */}
      <Text variant="body" weight="semibold" style={styles.listHeading}>{t('invite.title')}</Text>
      {rows.length === 0 ? (
        <Text variant="caption" color={colors.textMuted}>{t('invite.empty')}</Text>
      ) : (
        rows.map((inv) => <InviteRow key={inv.id} inv={inv} onRevoke={confirmRevoke} />)
      )}
    </Screen>
  );
}

function RolePill({ role }: { role: Role }) {
  return (
    <View style={styles.rolePill}>
      <Text variant="caption" color={colors.primary}>{role}</Text>
    </View>
  );
}

function InviteRow({ inv, onRevoke }: { inv: InviteListItem; onRevoke: (id: string) => void }) {
  return (
    <Card style={styles.row}>
      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <RolePill role={inv.role} />
          <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[inv.status] }]} />
          <Text variant="caption" color={STATUS_COLOR[inv.status]}>{inv.status}</Text>
        </View>
        {!!inv.note && <Text variant="caption" color={colors.textMuted} style={styles.rowNote}>{inv.note}</Text>}
        <Text variant="caption" color={colors.textSubtle}>{t('invite.expires', { when: when(inv.expiresAt) })}</Text>
      </View>
      {inv.status === 'ACTIVE' && (
        <Pressable onPress={() => onRevoke(inv.id)} hitSlop={8}>
          <Text variant="caption" color={colors.danger}>{t('invite.revoke')}</Text>
        </Pressable>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  subtitle: { marginTop: spacing.sm, marginBottom: spacing.md },
  block: { marginBottom: spacing.md },
  gap: { height: spacing.sm },
  chips: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  newInvite: { borderWidth: 1, borderColor: colors.accent },
  showQr: { marginTop: spacing.xs, marginBottom: spacing.md },
  qrWrap: { alignItems: 'center', marginBottom: spacing.md },
  code: { letterSpacing: 2, marginBottom: spacing.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, marginBottom: spacing.sm },
  listHeading: { marginTop: spacing.md, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowNote: { marginTop: 2, marginBottom: 2 },
  rolePill: { paddingVertical: 2, paddingHorizontal: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
});
