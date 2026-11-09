import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { TextField } from '../../components/TextField';
import { Button } from '../../components/Button';
import { DateTimeField } from '../../components/DateTimeField';
import { ToggleRow } from '../../components/ToggleRow';
import { ChoiceChips } from '../../components/ChoiceChips';
import { colors, spacing } from '../../theme';
import { meetingsApi } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import { Confidentiality } from '../../api/types';
import type { MeetingsStackParams } from '../../navigation/types';

type Props = NativeStackScreenProps<MeetingsStackParams, 'ScheduleMeeting'>;

const CONF: { value: Confidentiality; label: string }[] = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'INTERNAL', label: 'Internal' },
  { value: 'CONFIDENTIAL', label: 'Confidential' },
  { value: 'RESTRICTED', label: 'Restricted' },
];

export function ScheduleMeetingScreen({ navigation }: Props) {
  const qc = useQueryClient();
  const now = new Date();
  const defStart = new Date(now.getTime() + 60 * 60 * 1000); // +1h
  const defEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2h

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [agenda, setAgenda] = useState('');
  const [start, setStart] = useState(defStart);
  const [end, setEnd] = useState(defEnd);
  const [confidentiality, setConfidentiality] = useState<Confidentiality>('INTERNAL');
  const [passcode, setPasscode] = useState('');
  const [waitingRoom, setWaitingRoom] = useState(true);
  const [allowRecording, setAllowRecording] = useState(false);
  const [allowScreenShare, setAllowScreenShare] = useState(true);
  const [allowChat, setAllowChat] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!title.trim()) return setError('Title is required');
    if (end.getTime() <= start.getTime()) return setError('End time must be after start time');
    if (start.getTime() <= Date.now()) return setError('Start time must be in the future');

    setLoading(true);
    try {
      const meeting = await meetingsApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        agenda: agenda.trim() || undefined,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        confidentiality,
        waitingRoomEnabled: waitingRoom,
        passcode: passcode.trim() || undefined,
        policies: { allowRecording, allowScreenShare, allowChat },
      });
      await qc.invalidateQueries({ queryKey: ['meetings'] });
      navigation.replace('MeetingDetails', { id: meeting.id });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the meeting');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <Text variant="title" style={styles.h}>Schedule meeting</Text>

      <TextField label="Title" value={title} onChangeText={setTitle} placeholder="Meeting title" autoCapitalize="sentences" />
      <TextField label="Description (optional)" value={description} onChangeText={setDescription} multiline placeholder="What is this meeting about?" autoCapitalize="sentences" />
      <TextField label="Agenda (optional)" value={agenda} onChangeText={setAgenda} multiline placeholder="Agenda items" autoCapitalize="sentences" />

      <DateTimeField label="Starts" value={start} onChange={setStart} minimumDate={new Date()} />
      <DateTimeField label="Ends" value={end} onChange={setEnd} minimumDate={start} />

      <ChoiceChips label="Confidentiality" options={CONF} value={confidentiality} onChange={setConfidentiality} />

      <TextField label="Passcode (optional)" value={passcode} onChangeText={setPasscode} placeholder="Require a passcode to join" />

      <Text variant="label" color={colors.textMuted} style={styles.sectionLbl}>POLICIES</Text>
      <ToggleRow label="Waiting room" hint="Host admits participants" value={waitingRoom} onChange={setWaitingRoom} />
      <ToggleRow label="Allow recording" hint="Server-side, when host starts it" value={allowRecording} onChange={setAllowRecording} />
      <ToggleRow label="Allow screen share" value={allowScreenShare} onChange={setAllowScreenShare} />
      <ToggleRow label="Allow chat" value={allowChat} onChange={setAllowChat} />

      {!!error && <Text variant="body" color={colors.danger} style={styles.err}>{error}</Text>}

      <View style={styles.actions}>
        <Button title="Schedule" variant="accent" onPress={onSubmit} loading={loading} />
        <Button title="Cancel" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h: { marginTop: spacing.md, marginBottom: spacing.lg },
  sectionLbl: { marginTop: spacing.sm, marginBottom: spacing.xs, letterSpacing: 0.6 },
  err: { marginTop: spacing.sm },
  actions: { marginTop: spacing.lg, marginBottom: spacing.xxl },
});
