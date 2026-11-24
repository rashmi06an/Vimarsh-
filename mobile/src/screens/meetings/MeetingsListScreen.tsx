import React, { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Segmented } from '../../components/Segmented';
import { MeetingCard } from '../../components/MeetingCard';
import { LoadingState, EmptyState, ErrorState } from '../../components/States';
import { colors, radius, spacing } from '../../theme';
import { t } from '../../i18n';
import { meetingsApi } from '../../api/endpoints';
import { MeetingScope } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import type { MeetingsStackParams } from '../../navigation/types';

type Props = NativeStackScreenProps<MeetingsStackParams, 'MeetingsList'>;

const SCOPES: { value: MeetingScope; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'invitations', label: 'Invitations' },
  { value: 'mine', label: 'Scheduled by me' },
  { value: 'past', label: 'Past' },
];

const CAN_SCHEDULE = ['SUPER_ADMIN', 'MINISTRY', 'INSTITUTE_ADMIN', 'HOD', 'FACULTY', 'GUEST'];

export function MeetingsListScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [scope, setScope] = useState<MeetingScope>('upcoming');
  const query = useQuery({ queryKey: ['meetings', scope], queryFn: () => meetingsApi.list(scope) });

  useFocusEffect(
    React.useCallback(() => {
      query.refetch();
    }, [scope]),
  );

  const canSchedule = CAN_SCHEDULE.includes(user?.role ?? '');

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text variant="title">{t('tabs.meetings')}</Text>
        <View style={styles.segment}>
          <Segmented options={SCOPES} value={scope} onChange={setScope} />
        </View>
      </View>

      {query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState message={(query.error as Error)?.message} onRetry={() => query.refetch()} />
      ) : (
        <FlatList
          data={query.data ?? []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />}
          renderItem={({ item }) => (
            <MeetingCard meeting={item} onPress={() => navigation.navigate('MeetingDetails', { id: item.id })} />
          )}
          ListEmptyComponent={<EmptyState title="No meetings" hint="Meetings in this view will appear here." />}
        />
      )}

      {canSchedule && (
        <Pressable style={styles.fab} onPress={() => navigation.navigate('ScheduleMeeting')}>
          <Ionicons name="add" size={26} color="#fff" />
        </Pressable>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  segment: { marginTop: spacing.xs },
  list: { padding: spacing.lg, flexGrow: 1 },
  fab: {
    position: 'absolute', right: spacing.lg, bottom: spacing.xl,
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
});
