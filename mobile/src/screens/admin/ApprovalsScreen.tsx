import React, { useState } from 'react';
import { Alert, FlatList, Modal, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { colors, radius, spacing } from '../../theme';
import { approvalsApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthContext';
import { Role } from '../../api/types';

export function ApprovalsScreen() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['approvals'], queryFn: () => approvalsApi.pending() });
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  // Institute Admin may grant FACULTY/HOD; Super Admin may also grant MINISTRY/INSTITUTE_ADMIN.
  const roles: Role[] = user?.role === 'SUPER_ADMIN'
    ? ['FACULTY', 'HOD', 'INSTITUTE_ADMIN', 'MINISTRY']
    : ['FACULTY', 'HOD'];

  const approve = async (userId: string, role: Role) => {
    setBusy(userId);
    try { await approvalsApi.approve(userId, role); qc.invalidateQueries({ queryKey: ['approvals'] }); }
    catch (e) { Alert.alert('Could not approve', (e as Error).message); }
    finally { setBusy(null); }
  };

  const submitReject = async () => {
    if (!rejectId || !reason.trim()) return;
    setBusy(rejectId);
    try {
      await approvalsApi.reject(rejectId, reason.trim());
      qc.invalidateQueries({ queryKey: ['approvals'] });
      setRejectId(null); setReason('');
    } catch (e) { Alert.alert('Could not reject', (e as Error).message); }
    finally { setBusy(null); }
  };

  if (q.isLoading) return <Screen><LoadingState /></Screen>;
  if (q.isError) return <Screen><ErrorState message={(q.error as Error)?.message} onRetry={() => q.refetch()} /></Screen>;

  return (
    <Screen padded={false}>
      <Text variant="title" style={styles.h}>Pending approvals</Text>
      <FlatList
        data={q.data ?? []}
        keyExtractor={(u) => u.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
        ListEmptyComponent={<EmptyState title="No pending approvals" hint="New registrations awaiting review appear here." />}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Text variant="heading">{item.fullName}</Text>
            <Text variant="caption" color={colors.textMuted}>{item.email}</Text>
            <Text variant="caption" color={colors.textMuted}>{item.org?.name ?? '—'} · {item.designation ?? '—'}</Text>

            <Text variant="label" color={colors.textMuted} style={styles.assign}>APPROVE AS</Text>
            <View style={styles.roleRow}>
              {roles.map((r) => (
                <Pressable key={r} style={styles.roleChip} onPress={() => approve(item.id, r)} disabled={busy === item.id}>
                  <Text variant="label" color={colors.primary}>{r.replace('_', ' ')}</Text>
                </Pressable>
              ))}
            </View>
            <Button title="Reject" variant="outline" onPress={() => { setRejectId(item.id); setReason(''); }} />
          </Card>
        )}
      />

      <Modal visible={!!rejectId} transparent animationType="slide" onRequestClose={() => setRejectId(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.sheet}>
            <Text variant="heading" style={styles.sheetTitle}>Reject application</Text>
            <TextField label="Reason (shown to the applicant)" value={reason} onChangeText={setReason} multiline autoCapitalize="sentences" />
            <Button title="Reject" variant="danger" onPress={submitReject} disabled={!reason.trim()} />
            <Button title="Cancel" variant="ghost" onPress={() => setRejectId(null)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h: { marginTop: spacing.md, marginBottom: spacing.sm, paddingHorizontal: spacing.lg },
  list: { padding: spacing.lg, flexGrow: 1, gap: spacing.md },
  card: { gap: 4 },
  assign: { marginTop: spacing.md },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.sm },
  roleChip: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg },
  sheetTitle: { marginBottom: spacing.md },
});

