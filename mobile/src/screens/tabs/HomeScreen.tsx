import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { RoleBadge } from '../../components/Badge';
import { MeetingCard } from '../../components/MeetingCard';
import { Wordmark } from '../../components/Wordmark';
import { EmptyState, LoadingState } from '../../components/States';
import { colors, spacing } from '../../theme';
import { t } from '../../i18n';
import { useAuth } from '../../auth/AuthContext';
import { meetingsApi, invitationsApi } from '../../api/endpoints';

const QUICK: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'schedule', label: 'Schedule', icon: 'add-circle-outline' },
  { key: 'join', label: 'Join', icon: 'videocam-outline' },
  { key: 'calendar', label: 'Calendar', icon: 'calendar-outline' },
  { key: 'history', label: 'History', icon: 'time-outline' },
];

const CAN_SCHEDULE = ['SUPER_ADMIN', 'MINISTRY', 'INSTITUTE_ADMIN', 'HOD', 'FACULTY'];

export function HomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const firstName = (user?.fullName ?? '').split(' ')[0] || 'there';
  const canSchedule = CAN_SCHEDULE.includes(user?.role ?? '');

  const upcoming = useQuery({ queryKey: ['meetings', 'upcoming'], queryFn: () => meetingsApi.list('upcoming') });
  const ongoing = useQuery({ queryKey: ['meetings', 'ongoing'], queryFn: () => meetingsApi.list('ongoing') });
  const invites = useQuery({ queryKey: ['invitations'], queryFn: () => invitationsApi.mine() });

  useFocusEffect(React.useCallback(() => {
    upcoming.refetch(); ongoing.refetch(); invites.refetch();
  }, []));

  const onQuick = (key: string) => {
    switch (key) {
      case 'schedule': navigation.navigate('Meetings', { screen: canSchedule ? 'ScheduleMeeting' : 'MeetingsList' }); break;
      case 'join': navigation.navigate('Meetings', { screen: 'MeetingsList' }); break;
      case 'calendar': navigation.navigate('Calendar'); break;
      case 'history': navigation.navigate('Meetings', { screen: 'MeetingsList' }); break;
    }
  };

  const openMeeting = (id: string) => navigation.navigate('Meetings', { screen: 'MeetingDetails', params: { id } });

  return (
    <Screen scroll>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text variant="caption" color={colors.textMuted}>{user?.org?.name ?? 'AICTE Vimarsh'}</Text>
          <Text variant="heading">{t('home.greeting', { name: firstName })}</Text>
          {!!user?.designation && <Text variant="caption" color={colors.textMuted}>{user.designation}</Text>}
        </View>
        {user?.role && <RoleBadge role={user.role} />}
      </View>

      <View style={styles.actions}>
        {QUICK.map((a) => (
          <Pressable key={a.key} style={styles.actionWrap} onPress={() => onQuick(a.key)}>
            <Card style={styles.action}>
              <Ionicons name={a.icon} size={22} color={colors.primary} />
              <Text variant="label" color={colors.primary} center style={styles.actionLabel}>{a.label}</Text>
            </Card>
          </Pressable>
        ))}
      </View>

      <Section title={t('home.live')}>
        {ongoing.isLoading ? <LoadingState /> : (ongoing.data ?? []).length === 0
          ? <EmptyState title="No live meetings" />
          : (ongoing.data ?? []).map((m) => <MeetingCard key={m.id} meeting={m} onPress={() => openMeeting(m.id)} />)}
      </Section>

      <Section title={t('home.invitations')}>
        {invites.isLoading ? <LoadingState /> : (invites.data ?? []).length === 0
          ? <EmptyState title="No pending invitations" />
          : (invites.data ?? []).map((i) => (
            <Card key={i.invitationId} onPress={() => openMeeting(i.meeting.id)} style={styles.inviteCard}>
              <Text variant="body" weight="semibold">{i.meeting.title}</Text>
              <Text variant="caption" color={colors.textMuted}>{i.meeting.meetingCode}</Text>
            </Card>
          ))}
      </Section>

      <Section title={t('home.upcoming')}>
        {upcoming.isLoading ? <LoadingState /> : (upcoming.data ?? []).length === 0
          ? <EmptyState title="Nothing scheduled" hint="Upcoming meetings will appear here." />
          : (upcoming.data ?? []).slice(0, 5).map((m) => <MeetingCard key={m.id} meeting={m} onPress={() => openMeeting(m.id)} />)}
      </Section>

      <View style={styles.footer}><Wordmark size="sm" /></View>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="label" color={colors.textMuted} style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.md, marginBottom: spacing.lg, gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  actionWrap: { flex: 1 },
  action: { paddingVertical: spacing.md, alignItems: 'center', gap: 6 },
  actionLabel: { marginTop: 2 },
  section: { marginBottom: spacing.lg },
  sectionTitle: { marginBottom: spacing.sm, letterSpacing: 0.6 },
  inviteCard: { marginBottom: spacing.sm, gap: 2 },
  footer: { alignItems: 'center', paddingVertical: spacing.xl, opacity: 0.6 },
});
