import React from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { ConfidentialityBadge } from '../../components/Badge';
import { LoadingState, ErrorState } from '../../components/States';
import { RecordingsSection } from './RecordingsSection';
import { colors, spacing } from '../../theme';
import { meetingsApi, invitationsApi } from '../../api/endpoints';
import { formatRange, durationMinutes } from '../../utils/datetime';
import type { MeetingsStackParams } from '../../navigation/types';

type Props = NativeStackScreenProps<MeetingsStackParams, 'MeetingDetails'>;

export function MeetingDetailsScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['meeting', id], queryFn: () => meetingsApi.details(id) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['meeting', id] });
    qc.invalidateQueries({ queryKey: ['meetings'] });
  };

  if (q.isLoading) return <Screen><LoadingState /></Screen>;
  if (q.isError || !q.data) return <Screen><ErrorState message={(q.error as Error)?.message} onRetry={() => q.refetch()} /></Screen>;

  const m = q.data;
  const isCancelled = m.status === 'CANCELLED';
  const isEnded = m.status === 'ENDED';
  const now = Date.now();
  const joinWindowOpen = now >= new Date(m.startAt).getTime() - 10 * 60 * 1000 && now <= new Date(m.endAt).getTime();
  const canJoin = !isCancelled && !isEnded && (m.canManage || m.myInvitationStatus === 'ACCEPTED' || m.myInvitationStatus === 'PENDING');

  const respond = async (accept: boolean) => {
    const invite = m.myInvitationStatus;
    if (!invite) return;
    try {
      // We need the invitation id; fetch from /invitations/me.
      const mine = await invitationsApi.mine();
      const inv = mine.find((x) => x.meeting.id === id);
      if (!inv) return;
      await (accept ? invitationsApi.accept(inv.invitationId) : invitationsApi.decline(inv.invitationId));
      refresh();
    } catch {
      Alert.alert('Could not update invitation');
    }
  };

  const cancelMeeting = () => {
    Alert.alert('Cancel meeting', 'This notifies all participants. Continue?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, cancel', style: 'destructive',
        onPress: async () => {
          try { await meetingsApi.cancel(id); refresh(); } catch { Alert.alert('Could not cancel'); }
        },
      },
    ]);
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <View style={styles.topRow}>
          <Text variant="caption" color={colors.textMuted} style={{ flex: 1 }}>{m.meetingCode}</Text>
          <ConfidentialityBadge level={m.confidentiality} />
        </View>
        <Text variant="title" style={styles.title}>{m.title}</Text>
        <Text variant="body" color={colors.textMuted}>{formatRange(m.startAt, m.endAt)} · {durationMinutes(m.startAt, m.endAt)} min</Text>
        {isCancelled && <Text variant="label" color={colors.danger} style={styles.statusTag}>CANCELLED</Text>}
      </View>

      {canJoin && (
        <Button
          title={joinWindowOpen ? 'Join meeting' : 'Join (opens near start time)'}
          variant="accent"
          onPress={() => navigation.navigate('MeetingRoom', { meetingId: id })}
        />
      )}

      {m.myInvitationStatus === 'PENDING' && (
        <View style={styles.inviteActions}>
          <Button title="Accept" variant="primary" onPress={() => respond(true)} />
          <View style={{ height: spacing.sm }} />
          <Button title="Decline" variant="outline" onPress={() => respond(false)} />
        </View>
      )}

      {!!m.agenda && (
        <Card style={styles.card}>
          <Text variant="label" color={colors.textMuted}>AGENDA</Text>
          <Text variant="body" style={styles.gap}>{m.agenda}</Text>
        </Card>
      )}
      {!!m.description && (
        <Card style={styles.card}>
          <Text variant="label" color={colors.textMuted}>DESCRIPTION</Text>
          <Text variant="body" style={styles.gap}>{m.description}</Text>
        </Card>
      )}

      <Card style={styles.card}>
        <Row icon="person-outline" label="Host" value={m.host?.fullName ?? '—'} />
        <Row icon="people-outline" label="Participants" value={`${m.participants.length}`} />
        <Row icon="shield-outline" label="Waiting room" value={m.waitingRoomEnabled ? 'On' : 'Off'} />
        {m.hasPasscode && <Row icon="lock-closed-outline" label="Passcode" value="Required" />}
      </Card>

      {/* File sharing has been removed — use in-meeting screen share instead. */}

      {/* Recordings — shown when recording is permitted (the only case in which any can exist).
          Any meeting viewer can access them; opening one is audit-logged by the backend. */}
      {!isCancelled && m.policies.allowRecording && (
        <RecordingsSection meetingId={id} />
      )}

      {m.canManage && !isCancelled && !isEnded && (
        <View style={styles.hostActions}>
          <Text variant="label" color={colors.textMuted} style={styles.sectionLbl}>HOST CONTROLS</Text>
          <Button title="Invite participants" variant="outline" onPress={() => navigation.navigate('InviteParticipants', { meetingId: id })} />
          <View style={{ height: spacing.sm }} />
          <Button title="Cancel meeting" variant="danger" onPress={cancelMeeting} />
        </View>
      )}
    </Screen>
  );
}

function Row({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <Text variant="body" color={colors.textMuted} style={{ flex: 1 }}>{label}</Text>
      <Text variant="body" weight="medium">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.md, marginBottom: spacing.lg },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  title: { marginTop: spacing.xs, marginBottom: spacing.xs },
  statusTag: { marginTop: spacing.sm },
  inviteActions: { marginTop: spacing.md },
  card: { marginTop: spacing.md, gap: 2 },
  gap: { marginTop: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  hostActions: { marginTop: spacing.xl, marginBottom: spacing.xxl },
  sectionLbl: { marginBottom: spacing.sm, letterSpacing: 0.6 },
});
