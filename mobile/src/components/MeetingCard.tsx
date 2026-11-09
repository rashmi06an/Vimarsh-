import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { Text } from './Text';
import { ConfidentialityBadge } from './Badge';
import { colors, spacing } from '../theme';
import { formatRange } from '../utils/datetime';
import { MeetingSummary } from '../api/types';

const statusColor: Record<string, string> = {
  SCHEDULED: colors.primaryLight,
  LIVE: colors.success,
  ENDED: colors.textSubtle,
  CANCELLED: colors.danger,
};

export function MeetingCard({ meeting, onPress }: { meeting: MeetingSummary; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.topRow}>
        <View style={[styles.statusDot, { backgroundColor: statusColor[meeting.status] ?? colors.textSubtle }]} />
        <Text variant="caption" color={colors.textMuted} style={{ flex: 1 }}>{meeting.meetingCode}</Text>
        <ConfidentialityBadge level={meeting.confidentiality} />
      </View>

      <Text variant="heading" numberOfLines={2} style={styles.title}>{meeting.title}</Text>
      <Text variant="body" color={colors.textMuted}>{formatRange(meeting.startAt, meeting.endAt)}</Text>

      <View style={styles.metaRow}>
        <Meta icon="person-outline" text={meeting.hostName} />
        <Meta icon="people-outline" text={`${meeting.participantCount}`} />
        {meeting.hasPasscode && <Meta icon="lock-closed-outline" text="Passcode" />}
        {meeting.locked && <Meta icon="lock-closed" text="Locked" />}
        {meeting.status === 'LIVE' && (
          <View style={styles.liveTag}>
            <Text variant="caption" color="#fff">LIVE</Text>
          </View>
        )}
      </View>
    </Card>
  );
}

function Meta({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.meta}>
      <Ionicons name={icon} size={14} color={colors.textMuted} />
      <Text variant="caption" color={colors.textMuted}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md, gap: 6 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  title: { marginTop: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveTag: { backgroundColor: colors.success, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
});
