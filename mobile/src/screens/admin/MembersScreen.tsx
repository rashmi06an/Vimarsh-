import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { TextField } from '../../components/TextField';
import { LoadingState, ErrorState } from '../../components/States';
import { colors, radius, spacing } from '../../theme';
import { usersApi } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import type { MemberItem } from '../../api/types';

export function MembersScreen() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const q = useQuery({ queryKey: ['members'], queryFn: () => usersApi.members() });

  const setAccess = useMutation({
    mutationFn: ({ id, suspend }: { id: string; suspend: boolean }) =>
      suspend ? usersApi.suspend(id) : usersApi.restore(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
    onError: (e) => Alert.alert('Could not update', e instanceof ApiError ? e.message : 'Please try again.'),
  });

  const members = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = q.data ?? [];
    if (!term) return rows;
    return rows.filter((m) => m.fullName.toLowerCase().includes(term) || m.email.toLowerCase().includes(term));
  }, [q.data, search]);

  const confirm = (m: MemberItem, suspend: boolean) =>
    Alert.alert(
      suspend ? 'Revoke access' : 'Restore access',
      suspend
        ? `Revoke ${m.fullName}'s access? They will be signed out and cannot log in until restored.`
        : `Restore ${m.fullName}'s access?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: suspend ? 'Revoke' : 'Restore', style: suspend ? 'destructive' : 'default', onPress: () => setAccess.mutate({ id: m.id, suspend }) },
      ],
    );

  if (q.isLoading) return <Screen><LoadingState /></Screen>;
  if (q.isError) return <Screen><ErrorState onRetry={() => q.refetch()} /></Screen>;

  return (
    <Screen scroll>
      <Text variant="body" color={colors.textMuted} style={styles.sub}>
        Manage who can use the platform. Revoking access signs the member out and blocks login until restored.
      </Text>
      <TextField label="Search" value={search} onChangeText={setSearch} placeholder="Name or email" autoCapitalize="none" />

      {members.length === 0 ? (
        <Text variant="caption" color={colors.textMuted} style={styles.gap}>No members found.</Text>
      ) : (
        members.map((m) => {
          const suspended = m.status === 'SUSPENDED';
          return (
            <Card key={m.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text variant="body" weight="medium" numberOfLines={1}>{m.fullName}</Text>
                <Text variant="caption" color={colors.textMuted} numberOfLines={1}>{m.email}</Text>
                <View style={styles.meta}>
                  <View style={styles.pill}><Text variant="caption" color={colors.primary}>{m.role}</Text></View>
                  <Text variant="caption" color={suspended ? colors.danger : colors.success}>{suspended ? 'Suspended' : m.status === 'APPROVED' ? 'Active' : m.status}</Text>
                </View>
              </View>
              <Pressable
                style={[styles.btn, suspended ? styles.restore : styles.revoke]}
                onPress={() => confirm(m, !suspended)}
                disabled={setAccess.isPending}
              >
                <Text variant="label" color={suspended ? colors.success : colors.danger}>{suspended ? 'Restore' : 'Revoke'}</Text>
              </Pressable>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { marginTop: spacing.md, marginBottom: spacing.md },
  gap: { marginTop: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  pill: { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  btn: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1 },
  revoke: { borderColor: colors.danger },
  restore: { borderColor: colors.success },
});
