import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, PermissionsAndroid, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Socket } from 'socket.io-client';
import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { colors, spacing } from '../../theme';
import { meetingsApi, roomApi, JoinTokenResponse } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import { connectMeetingSocket } from '../../realtime/socket';
import { RoomErrorBoundary } from './RoomErrorBoundary';
import type { MeetingsStackParams } from '../../navigation/types';

type Props = NativeStackScreenProps<MeetingsStackParams, 'MeetingRoom'>;

// Lazy so the native WebRTC module only loads when actually entering a room
// (keeps the rest of the app usable in Expo Go; the room needs a dev build).
const RoomView = React.lazy(() => import('./RoomView').then((m) => ({ default: m.RoomView })));

// Android requires camera + microphone to be granted at RUNTIME (declaring them in the
// manifest is not enough). Without this, LiveKit cannot capture media and the room drops
// immediately, which looked like "Preparing…" then an instant exit. iOS prompts on first
// capture via the Info.plist usage strings, so no explicit request is needed there.
async function ensureMediaPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const res = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]);
    return (
      res[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED &&
      res[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED
    );
  } catch {
    return false;
  }
}

type Phase = 'loading' | 'passcode' | 'waiting' | 'joined' | 'error';

export function MeetingRoomScreen({ route, navigation }: Props) {
  const { meetingId } = route.params;
  const [phase, setPhase] = useState<Phase>('loading');
  const [title, setTitle] = useState('Meeting');
  const [passcode, setPasscode] = useState('');
  const [needPasscode, setNeedPasscode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinInfo, setJoinInfo] = useState<JoinTokenResponse | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const leave = useCallback(() => {
    socketRef.current?.close();
    navigation.goBack();
  }, [navigation]);

  const fetchTokenAndJoin = useCallback(async () => {
    try {
      const info = await roomApi.token(meetingId);
      setJoinInfo(info);
      setPhase('joined');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not join');
      setPhase('error');
    }
  }, [meetingId]);

  const attemptJoin = useCallback(async (code?: string) => {
    setError(null);
    setPhase('loading');
    try {
      const res = await roomApi.joinRequest(meetingId, code);
      if (res.admitted) {
        await fetchTokenAndJoin();
      } else {
        setPhase('waiting');
        // Listen for admission over the socket.
        const socket = await connectMeetingSocket(meetingId);
        socketRef.current = socket;
        socket.on('waiting:admitted', () => fetchTokenAndJoin());
        socket.on('waiting:denied', () => { setError('The host denied your request to join.'); setPhase('error'); });
        socket.on('meeting:ended', () => { setError('The meeting has ended.'); setPhase('error'); });
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not join';
      if (err instanceof ApiError && /passcode/i.test(msg)) {
        setNeedPasscode(true);
        setPhase('passcode');
      } else {
        setError(msg);
        setPhase('error');
      }
    }
  }, [meetingId, fetchTokenAndJoin]);

  useEffect(() => {
    (async () => {
      const granted = await ensureMediaPermissions();
      if (!granted) {
        setError('Camera and microphone access are required to join the meeting. Please allow them (or enable them in Settings) and try again.');
        setPhase('error');
        return;
      }
      try {
        const m = await meetingsApi.details(meetingId);
        setTitle(m.title);
        if (m.hasPasscode && !m.canManage) { setNeedPasscode(true); setPhase('passcode'); }
        else attemptJoin();
      } catch {
        attemptJoin();
      }
    })();
    return () => { socketRef.current?.close(); };
  }, [meetingId]);

  if (phase === 'joined' && joinInfo) {
    return (
      <RoomErrorBoundary onLeave={leave}>
        <Suspense fallback={<Centered><ActivityIndicator color="#fff" size="large" /><Label>Connecting to room…</Label></Centered>}>
          <RoomView
            meetingId={meetingId}
            title={title}
            token={joinInfo.token}
            url={joinInfo.url}
            isHost={joinInfo.isHost}
            onLeave={leave}
          />
        </Suspense>
      </RoomErrorBoundary>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.center}>
        <Text variant="title" color={colors.roomText} center>{title}</Text>

        {phase === 'loading' && (<><ActivityIndicator color="#fff" size="large" style={styles.gap} /><Label>Preparing…</Label></>)}

        {phase === 'waiting' && (
          <>
            <ActivityIndicator color={colors.accent} size="large" style={styles.gap} />
            <Label>Waiting for the host to admit you…</Label>
            <Button title="Leave" variant="danger" fullWidth={false} onPress={leave} />
          </>
        )}

        {phase === 'passcode' && (
          <View style={styles.form}>
            <Label>This meeting requires a passcode.</Label>
            <TextField label="Passcode" value={passcode} onChangeText={setPasscode} secure />
            <Button title="Join" variant="accent" onPress={() => attemptJoin(passcode)} />
            <Button title="Cancel" variant="ghost" onPress={leave} />
          </View>
        )}

        {phase === 'error' && (
          <>
            <Label>{error ?? 'Could not join the meeting.'}</Label>
            <Button title="Back" variant="outline" fullWidth={false} onPress={leave} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={[styles.root, styles.center]}>{children}</View>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <Text variant="body" color="rgba(255,255,255,0.8)" center style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.roomBg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  gap: { marginVertical: spacing.md },
  label: { maxWidth: 320 },
  form: { alignSelf: 'stretch', gap: spacing.sm },
});
