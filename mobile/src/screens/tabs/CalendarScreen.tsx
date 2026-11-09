import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { MeetingCard } from '../../components/MeetingCard';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { colors, radius, spacing } from '../../theme';
import { meetingsApi } from '../../api/endpoints';
import { MONTHS, WEEKDAYS, monthGrid, isSameDay } from '../../utils/datetime';

export function CalendarScreen() {
  const navigation = useNavigation<any>();
  const [anchor, setAnchor] = useState(new Date());
  const [selected, setSelected] = useState(new Date());
  const q = useQuery({ queryKey: ['meetings', 'all'], queryFn: () => meetingsApi.list('all') });

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    (q.data ?? []).forEach((m) => {
      const d = new Date(m.startAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [q.data]);

  const grid = useMemo(() => monthGrid(anchor), [anchor]);
  const dayMeetings = (q.data ?? []).filter((m) => isSameDay(new Date(m.startAt), selected));

  const shiftMonth = (delta: number) => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1));

  if (q.isLoading) return <Screen><LoadingState /></Screen>;
  if (q.isError) return <Screen><ErrorState message={(q.error as Error)?.message} onRetry={() => q.refetch()} /></Screen>;

  return (
    <Screen scroll>
      <Text variant="title" style={styles.h}>Calendar</Text>

      <View style={styles.monthRow}>
        <Pressable onPress={() => shiftMonth(-1)} hitSlop={10}><Ionicons name="chevron-back" size={22} color={colors.primary} /></Pressable>
        <Text variant="heading">{MONTHS[anchor.getMonth()]} {anchor.getFullYear()}</Text>
        <Pressable onPress={() => shiftMonth(1)} hitSlop={10}><Ionicons name="chevron-forward" size={22} color={colors.primary} /></Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w) => <Text key={w} variant="caption" color={colors.textMuted} style={styles.weekCell}>{w}</Text>)}
      </View>

      <View style={styles.grid}>
        {grid.map((d, i) => {
          const inMonth = d.getMonth() === anchor.getMonth();
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const has = byDay.has(key);
          const isSel = isSameDay(d, selected);
          const isToday = isSameDay(d, new Date());
          return (
            <Pressable key={i} style={styles.dayCell} onPress={() => setSelected(new Date(d))}>
              <View style={[styles.dayInner, isSel && styles.daySelected, isToday && !isSel && styles.dayToday]}>
                <Text variant="body" color={isSel ? '#fff' : inMonth ? colors.text : colors.textSubtle}>{d.getDate()}</Text>
              </View>
              {has && <View style={[styles.dot, { backgroundColor: isSel ? colors.accent : colors.primaryLight }]} />}
            </Pressable>
          );
        })}
      </View>

      <Text variant="label" color={colors.textMuted} style={styles.sectionLbl}>
        {selected.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}
      </Text>
      {dayMeetings.length === 0 ? (
        <View style={styles.empty}><EmptyState title="No meetings on this day" /></View>
      ) : (
        dayMeetings.map((m) => (
          <MeetingCard key={m.id} meeting={m} onPress={() => navigation.navigate('Meetings', { screen: 'MeetingDetails', params: { id: m.id } })} />
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  h: { marginTop: spacing.md, marginBottom: spacing.md },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  weekRow: { flexDirection: 'row', marginBottom: spacing.xs },
  weekCell: { flex: 1, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 },
  dayInner: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: colors.primary },
  dayToday: { borderWidth: 1, borderColor: colors.accent },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  sectionLbl: { marginTop: spacing.lg, marginBottom: spacing.sm, letterSpacing: 0.6 },
  empty: { height: 140 },
});
