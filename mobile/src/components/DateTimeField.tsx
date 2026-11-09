import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme';
import { Text } from './Text';
import { formatDate, formatTime } from '../utils/datetime';

interface Props {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  mode?: 'datetime' | 'date' | 'time';
  minimumDate?: Date;
}

/** Date/time picker field that works on both iOS (spinner) and Android (dialogs). */
export function DateTimeField({ label, value, onChange, mode = 'datetime', minimumDate }: Props) {
  const [show, setShow] = useState<null | 'date' | 'time'>(null);

  const openAndroid = (which: 'date' | 'time') => setShow(which);

  const handle = (_e: unknown, selected?: Date) => {
    if (Platform.OS === 'android') setShow(null);
    if (!selected) return;
    onChange(selected);
  };

  const display = mode === 'time' ? formatTime(value.toISOString()) : mode === 'date' ? formatDate(value.toISOString()) : `${formatDate(value.toISOString())} · ${formatTime(value.toISOString())}`;

  return (
    <View style={styles.wrap}>
      <Text variant="label" color={colors.textMuted} style={styles.label}>{label}</Text>

      {Platform.OS === 'ios' ? (
        <View style={styles.iosRow}>
          {(mode === 'datetime' || mode === 'date') && (
            <DateTimePicker value={value} mode="date" display="compact" minimumDate={minimumDate} onChange={handle} />
          )}
          {(mode === 'datetime' || mode === 'time') && (
            <DateTimePicker value={value} mode="time" display="compact" onChange={handle} />
          )}
        </View>
      ) : (
        <View style={styles.androidRow}>
          {(mode === 'datetime' || mode === 'date') && (
            <Pressable style={styles.androidBtn} onPress={() => openAndroid('date')}>
              <Ionicons name="calendar-outline" size={16} color={colors.primary} />
              <Text variant="body">{formatDate(value.toISOString())}</Text>
            </Pressable>
          )}
          {(mode === 'datetime' || mode === 'time') && (
            <Pressable style={styles.androidBtn} onPress={() => openAndroid('time')}>
              <Ionicons name="time-outline" size={16} color={colors.primary} />
              <Text variant="body">{formatTime(value.toISOString())}</Text>
            </Pressable>
          )}
          {show && (
            <DateTimePicker value={value} mode={show} display="default" minimumDate={show === 'date' ? minimumDate : undefined} onChange={handle} />
          )}
        </View>
      )}
      {/* keep display text for accessibility/debug */}
      <Text variant="caption" color={colors.textSubtle} style={styles.hint}>{display}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: { marginBottom: spacing.xs },
  iosRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  androidRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  androidBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  hint: { marginTop: 4 },
});
