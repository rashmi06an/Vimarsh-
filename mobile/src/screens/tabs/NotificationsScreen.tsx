import React from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { colors, spacing } from '../../theme';
import { notificationsApi } from '../../api/endpoints';
import { NotificationItem } from '../../api/types';
import { formatDate, formatTime } from '../../utils/datetime';

const iconFor: Record<string, keyof typeof Ionicons.glyphMap> = {
  INVITATION: 'mail-outline',
  MEETING_UPDATED: 'create-outline',
  MEETING_CANCELLED: 'close-circle-outline',
  MEETING_REMINDER: 'alarm-outline',
  APPROVAL_GRANTED: 'checkmark-circle-outline',
  APPROVAL_REJECTED: 'close-circle-outline',
  WAITING_ROOM_ADMITTED: 'enter-outline',
  ACCESS_REQUEST: 'person-add-outline',
  SECURITY_EVENT: 'shield-outline',
};

export function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => notificationsApi.list() });

  useFocusEffect(React.useCallback(() => { q.refetch(); }, []));

  const open = async (n: NotificationItem) => {
    if (!n.readAt) {
      await notificationsApi.markRead(n.id);
      qc.invalidateQueries({ queryKey: ['notifications'] });
    }
    const meetingId = n.data?.meetingId as string | undefined;
    if (meetingId) navigation.navigate('Meetings', { screen: 'MeetingDetails', params: { id: meetingId } });
  };

  const markAll = async () => {
    await notificationsApi.markAllRead();
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  if (q.isLoading) return <Screen><LoadingState /></Screen>;
  if (q.isError) return <Screen><ErrorState message={(q.error as Error)?.message} onRetry={() => q.refetch()} /></Screen>;

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text variant="title">Alerts</Text>
        {(q.data ?? []).some((n) => !n.readAt) && (
          <Button title="Mark all read" variant="ghost" fullWidth={false} onPress={markAll} />
        )}
      </View>
      <FlatList
        data={q.data ?? []}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
        ListEmptyComponent={<EmptyState title="No notifications" hint="Invitations, updates and alerts will appear here." />}
        renderItem={({ item }) => (
          <Pressable onPress={() => open(item)} style={[styles.item, !item.readAt && styles.unread]}>
            <View style={[styles.iconWrap, !item.readAt && styles.iconUnread]}>
              <Ionicons name={iconFor[item.type] ?? 'notifications-outline'} size={18} color={item.readAt ? colors.textMuted : colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="body" weight={item.readAt ? 'regular' : 'semibold'}>{item.title}</Text>
              <Text variant="caption" color={colors.textMuted}>{item.body}</Text>
              <Text variant="caption" color={colors.textSubtle} style={styles.time}>{formatDate(item.createdAt)} · {formatTime(item.createdAt)}</Text>
            </View>
            {!item.readAt && <View style={styles.dot} />}
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  list: { padding: spacing.lg, flexGrow: 1, gap: spacing.sm },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.md },
  unread: { borderColor: colors.primaryLight, backgroundColor: '#FBFCFE' },
  iconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  iconUnread: { backgroundColor: '#E9EEF7' },
  time: { marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginTop: 6 },
});
