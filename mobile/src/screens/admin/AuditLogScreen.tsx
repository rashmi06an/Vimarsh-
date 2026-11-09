import React, { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { colors, radius, spacing } from '../../theme';
import { auditApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthContext';
import { formatDate, formatTime } from '../../utils/datetime';

export function AuditLogScreen() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['audit'], queryFn: () => auditApi.list(150) });
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<{ valid: boolean; count: number; reason: string | null } | null>(null);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const verify = async () => {
    setVerifying(true);
    try { setResult(await auditApi.verify()); } catch { setResult(null); }
    finally { setVerifying(false); }
  };

  if (q.isLoading) return <Screen><LoadingState /></Screen>;
  if (q.isError) return <Screen><ErrorState message={(q.error as Error)?.message} onRetry={() => q.refetch()} /></Screen>;

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text variant="title">Audit log</Text>
        <Text variant="caption" color={colors.textMuted}>Append-only, SHA-256 hash-chained</Text>
      </View>

      {isSuperAdmin && (
        <View style={styles.verifyRow}>
          <Button title={verifying ? 'Verifying…' : 'Verify chain integrity'} variant="outline" onPress={verify} loading={verifying} />
          {result && (
            <View style={[styles.banner, { backgroundColor: result.valid ? '#E7F3EA' : '#FBE8E6' }]}>
              <Ionicons name={result.valid ? 'shield-checkmark' : 'warning'} size={18} color={result.valid ? colors.success : colors.danger} />
              <Text variant="label" color={result.valid ? colors.success : colors.danger}>
                {result.valid ? `Intact · ${result.count} records` : `Tampering detected: ${result.reason}`}
              </Text>
            </View>
          )}
        </View>
      )}

      <FlatList
        data={q.data ?? []}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
        ListEmptyComponent={<EmptyState title="No audit entries" />}
        renderItem={({ item }) => (
          <Card style={styles.entry}>
            <View style={styles.entryTop}>
              <Text variant="caption" color={colors.textSubtle}>#{item.seq}</Text>
              <Text variant="label" color={colors.primary} style={{ flex: 1 }}>{item.action}</Text>
              <Text variant="caption" color={colors.textSubtle}>{formatDate(item.createdAt)} {formatTime(item.createdAt)}</Text>
            </View>
            {!!item.targetType && (
              <Text variant="caption" color={colors.textMuted}>{item.targetType}{item.targetId ? ` · ${item.targetId.slice(-6)}` : ''}</Text>
            )}
            <Text variant="caption" color={colors.textSubtle} style={styles.hash}>hash {item.hash.slice(0, 16)}…</Text>
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  verifyRow: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
  list: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  entry: { gap: 2 },
  entryTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hash: { marginTop: 2, fontVariant: ['tabular-nums'] },
});
