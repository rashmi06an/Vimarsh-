import React, { useState } from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { TextField } from '../../components/TextField';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { colors, radius, spacing } from '../../theme';
import { meetingsApi } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import type { MeetingsStackParams } from '../../navigation/types';

type Props = NativeStackScreenProps<MeetingsStackParams, 'InviteParticipants'>;
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export function InviteParticipantsScreen({ route, navigation }: Props) {
  const { meetingId } = route.params;
  const qc = useQueryClient();
  const [input, setInput] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ invited: number; skipped: { who: string; reason: string }[]; guestLinks: { email: string; token: string }[] } | null>(null);

  const addEmail = () => {
    const e = input.trim().toLowerCase();
    if (!emailOk(e)) return setError('Enter a valid email');
    if (emails.includes(e)) return setError('Already added');
    setEmails([...emails, e]);
    setInput('');
    setError(null);
  };

  const submit = async () => {
    if (emails.length === 0) return setError('Add at least one email');
    setLoading(true);
    setError(null);
    try {
      const res = await meetingsApi.invite(meetingId, emails.map((email) => ({ email })));
      setResult(res);
      setEmails([]);
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
        Registered members of your institution are invited directly; others receive a guest link.
      </Text>

      <View style={styles.addRow}>
        <View style={{ flex: 1 }}>
          <TextField label="Email" value={input} onChangeText={setInput} keyboardType="email-address" placeholder="name@institute.ac.in" onSubmitEditing={addEmail} />
        </View>
        <Pressable style={styles.addBtn} onPress={addEmail}>
          <Ionicons name="add" size={22} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.chips}>
        {emails.map((e) => (
          <View key={e} style={styles.chip}>
            <Text variant="caption" color={colors.primary}>{e}</Text>
            <Pressable onPress={() => setEmails(emails.filter((x) => x !== e))} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        ))}
      </View>

      {!!error && <Text variant="body" color={colors.danger} style={styles.err}>{error}</Text>}

      {result && (
        <Card style={styles.result}>
          <Text variant="label" color={colors.success}>Invited: {result.invited}</Text>
          {result.skipped.length > 0 && (
            <Text variant="caption" color={colors.textMuted} style={styles.gap}>
              Skipped: {result.skipped.map((s) => `${s.who} (${s.reason})`).join(', ')}
            </Text>
          )}
          {result.guestLinks.length > 0 && (
            <Text variant="caption" color={colors.textMuted} style={styles.gap}>
              Guest links created for: {result.guestLinks.map((g) => g.email).join(', ')}
            </Text>
          )}
        </Card>
      )}

      <View style={styles.actions}>
        <Button title="Send invitations" variant="accent" onPress={submit} loading={loading} disabled={emails.length === 0} />
        <Button title="Done" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h: { marginTop: spacing.md },
  sub: { marginTop: spacing.xs, marginBottom: spacing.lg },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  addBtn: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  err: { marginTop: spacing.sm },
  result: { marginTop: spacing.lg },
  gap: { marginTop: spacing.xs },
  actions: { marginTop: spacing.xl, marginBottom: spacing.xxl },
});
