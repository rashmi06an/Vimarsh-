import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, Pressable } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { TextField } from '../../components/TextField';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { colors, radius, spacing } from '../../theme';
import { meetingsApi, usersApi } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import type { DirectoryUser } from '../../api/types';
import type { MeetingsStackParams } from '../../navigation/types';

type Props = NativeStackScreenProps<MeetingsStackParams, 'InviteParticipants'>;

export function InviteParticipantsScreen({ route, navigation }: Props) {
  const { meetingId } = route.params;
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<DirectoryUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ invited: number; skipped: { who: string; reason: string }[] } | null>(null);

  // Registered members the host may invite. Only in-app users appear here — there is no
  // external/email invite, because people outside the app receive no calendar or notification.
  const dir = useQuery({
    queryKey: ['directory', search],
    queryFn: () => usersApi.directory(search),
  });

  const selectedIds = useMemo(() => new Set(selected.map((u) => u.id)), [selected]);
  const results = (dir.data ?? []).filter((u) => !selectedIds.has(u.id));

  const toggle = (u: DirectoryUser) => {
    setError(null);
    setSelected((prev) => (prev.find((x) => x.id === u.id) ? prev.filter((x) => x.id !== u.id) : [...prev, u]));
  };

  const submit = async () => {
    if (selected.length === 0) return setError('Select at least one member');
    setLoading(true);
    setError(null);
    try {
      const res = await meetingsApi.invite(meetingId, selected.map((u) => ({ userId: u.id })));
      setResult({ invited: res.invited, skipped: res.skipped });
      setSelected([]);
      qc.invalidateQueries({ queryKey: ['meeting', meetingId] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send invitations');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <Text variant="title" style={styles.h}>Invite participants</Text>
      <Text variant="body" color={colors.textMuted} style={styles.sub}>
        Only registered members can be invited. They receive the meeting in their invitations and calendar.
      </Text>

      <TextField
        label="Search members"
        value={search}
        onChangeText={setSearch}
        placeholder="Name or email"
        autoCapitalize="none"
      />

      {selected.length > 0 && (
        <View style={styles.chips}>
          {selected.map((u) => (
            <View key={u.id} style={styles.chip}>
              <Text variant="caption" color={colors.primary}>{u.fullName}</Text>
              <Pressable onPress={() => toggle(u)} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {!!error && <Text variant="body" color={colors.danger} style={styles.err}>{error}</Text>}

      <View style={styles.list}>
        {dir.isLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.gap} />
        ) : dir.isError ? (
          <Text variant="caption" color={colors.danger}>Could not load members. Pull back and try again.</Text>
        ) : results.length === 0 ? (
          <Text variant="caption" color={colors.textMuted}>
            {search.trim() ? 'No matching members.' : 'No other members to invite yet.'}
          </Text>
        ) : (
          results.map((u) => (
            <Card key={u.id} onPress={() => toggle(u)} style={styles.row}>
              <View style={styles.avatar}><Text variant="label" color="#fff">{u.fullName.slice(0, 1).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text variant="body" weight="medium" numberOfLines={1}>{u.fullName}</Text>
                <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
                  {u.email}{u.orgName ? ` · ${u.orgName}` : ''}
                </Text>
              </View>
              <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
            </Card>
          ))
        )}
      </View>

      {result && (
        <Card style={styles.result}>
          <Text variant="label" color={colors.success}>Invited: {result.invited}</Text>
          {result.skipped.length > 0 && (
            <Text variant="caption" color={colors.textMuted} style={styles.gap}>
              Skipped: {result.skipped.map((s) => `${s.who} (${s.reason})`).join(', ')}
            </Text>
          )}
        </Card>
      )}

      <View style={styles.actions}>
        <Button title={`Invite ${selected.length || ''}`.trim()} variant="accent" onPress={submit} loading={loading} disabled={selected.length === 0} />
        <Button title="Done" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h: { marginTop: spacing.md },
  sub: { marginTop: spacing.xs, marginBottom: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  err: { marginTop: spacing.sm },
  list: { marginTop: spacing.lg, gap: spacing.sm },
  gap: { marginVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  result: { marginTop: spacing.lg },
  actions: { marginTop: spacing.xl, marginBottom: spacing.xxl },
});
