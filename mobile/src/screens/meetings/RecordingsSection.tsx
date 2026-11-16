import React from 'react';
import { ActivityIndicator, Alert, Linking, Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { colors, spacing } from '../../theme';
import { recordingsApi, RecordingItem } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import { formatDate, formatTime, durationMinutes } from '../../utils/datetime';

/**
 * Lists a meeting's recordings and lets an authorized viewer open/play a completed one.
 *
 * The backend never exposes the raw object: tapping a recording calls POST-less
 * `GET /recordings/:id/url`, which (a) re-checks that the caller can view the meeting,
 * (b) writes a `RECORDING_ACCESSED` entry to the tamper-evident audit log, and
 * (c) returns a SHORT-LIVED presigned URL to the private MinIO/S3 object. We then open
 * that URL in the device browser / player. This is the UI for the AICTE requirement
 * "access recordings" — the endpoints existed but had no screen until now.
 */

// Human-readable, colour-coded status for each recording lifecycle state.
function statusMeta(status: string, hasFile: boolean): { label: string; color: string; icon: keyof typeof Ionicons.glyphMap; openable: boolean } {
  switch (status) {
    case 'COMPLETED':
      return hasFile
        ? { label: 'Ready', color: colors.success, icon: 'play-circle-outline', openable: true }
        : { label: 'Processing…', color: colors.textMuted, icon: 'hourglass-outline', openable: false };
    case 'ACTIVE':
    case 'STARTING':
      return { label: 'Recording in progress', color: colors.accent, icon: 'ellipse', openable: false };
    case 'FAILED':
      return { label: 'Failed', color: colors.danger, icon: 'alert-circle-outline', openable: false };
    default:
      return { label: status.toLowerCase(), color: colors.textMuted, icon: 'videocam-outline', openable: false };
  }
}

export function RecordingsSection({ meetingId }: { meetingId: string }) {
  const q = useQuery({ queryKey: ['recordings', meetingId], queryFn: () => recordingsApi.list(meetingId) });
  const [openingId, setOpeningId] = React.useState<string | null>(null);

  const open = async (rec: RecordingItem) => {
    try {
      setOpeningId(rec.id);
      // Mint a fresh short-lived presigned URL on each open (and audit-log the access).
      const { url } = await recordingsApi.url(rec.id);
      if (Platform.OS === 'web') {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        const can = await Linking.canOpenURL(url);
        if (!can) throw new ApiError(0, 'No app available to open the recording.');
        await Linking.openURL(url);
      }
    } catch (err) {
      Alert.alert('Could not open recording', err instanceof ApiError ? err.message : 'Please try again.');
    } finally {
      setOpeningId(null);
    }
  };

  const recs = q.data ?? [];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text variant="label" color={colors.textMuted}>RECORDINGS ({recs.length})</Text>
      </View>

      {q.isLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.gap} />
      ) : recs.length === 0 ? (
        <Card style={styles.empty}>
          <Text variant="body" color={colors.textMuted}>No recordings yet.</Text>
          <Text variant="caption" color={colors.textMuted} style={{ marginTop: 2 }}>
            When the host records this meeting, it will appear here.
          </Text>
        </Card>
      ) : (
        <>
          {recs.map((r) => {
            const meta = statusMeta(r.status, r.hasFile);
            const mins = r.endedAt ? durationMinutes(r.startedAt, r.endedAt) : null;
            const body = (
              <>
                <Ionicons name={meta.icon} size={22} color={meta.color} />
                <View style={{ flex: 1 }}>
                  <Text variant="body" weight="medium" numberOfLines={1}>
                    {formatDate(r.startedAt)} · {formatTime(r.startedAt)}
                  </Text>
                  <Text variant="caption" color={meta.color}>
                    {meta.label}{mins != null ? ` · ${mins} min` : ''}
                  </Text>
                </View>
                {openingId === r.id ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : meta.openable ? (
                  <Ionicons name="open-outline" size={20} color={colors.textMuted} />
                ) : null}
              </>
            );
            return meta.openable ? (
              <Card key={r.id} onPress={() => open(r)} style={styles.rec}>{body}</Card>
            ) : (
              <Card key={r.id} style={styles.rec}>{body}</Card>
            );
          })}
          <Text variant="caption" color={colors.textMuted} style={styles.note}>
            <Ionicons name="shield-checkmark-outline" size={12} color={colors.textMuted} /> Recordings are stored
            privately; each time one is opened it is recorded in the audit trail.
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  gap: { marginVertical: spacing.md },
  empty: { paddingVertical: spacing.md },
  rec: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  note: { marginTop: spacing.xs },
});
