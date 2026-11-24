import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  AudioSession,
  LiveKitRoom,
  useTracks,
  useLocalParticipant,
  useParticipants,
  VideoTrack,
  isTrackReference,
  registerGlobals,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import * as ScreenCapture from 'expo-screen-capture';
import type { Socket } from 'socket.io-client';
import { Text } from '../../components/Text';
import { colors, radius, spacing } from '../../theme';
import { connectMeetingSocket, ChatMessage } from '../../realtime/socket';
import { roomApi, recordingsApi } from '../../api/endpoints';
import { Alert } from 'react-native';

// Register WebRTC globals once (requires a development build; no-op-safe to call once).
registerGlobals();

interface Props {
  meetingId: string;
  title: string;
  token: string;
  url: string;
  isHost: boolean;
  onLeave: () => void;
}

export function RoomView({ meetingId, title, token, url, isHost, onLeave }: Props) {
  useEffect(() => {
    let mounted = true;
    (async () => {
      await AudioSession.startAudioSession();
      // Block screenshots/screen recording of confidential meeting content (FLAG_SECURE on
      // Android, which also hides the content in the app switcher; screenshot block on iOS).
      try { await ScreenCapture.preventScreenCaptureAsync('vimarsh-room'); } catch { /* best effort */ }
    })();
    return () => {
      if (mounted) AudioSession.stopAudioSession();
      ScreenCapture.allowScreenCaptureAsync('vimarsh-room').catch(() => undefined);
      mounted = false;
    };
  }, []);

  return (
    <LiveKitRoom
      serverUrl={url}
      token={token}
      connect
      audio
      video
      onDisconnected={onLeave}
      onError={(e) => {
        Alert.alert('Connection problem', e?.message || 'Could not connect to the meeting. Please check your connection and try again.');
      }}
    >
      <RoomInner meetingId={meetingId} title={title} isHost={isHost} onLeave={onLeave} />
    </LiveKitRoom>
  );
}

function RoomInner({ meetingId, title, isHost, onLeave }: { meetingId: string; title: string; isHost: boolean; onLeave: () => void }) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
  );
  const participants = useParticipants();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();

  const [elapsed, setElapsed] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [paxOpen, setPaxOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [handRaised, setHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState<Record<string, boolean>>({});
  const [waiting, setWaiting] = useState<Array<{ userId: string | null; name: string }>>([]);
  const [unread, setUnread] = useState(0);
  const [recording, setRecording] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const toggleRecording = async () => {
    try {
      if (recording) { await recordingsApi.stop(meetingId); setRecording(false); }
      else { await recordingsApi.start(meetingId); setRecording(true); }
    } catch (e) {
      Alert.alert('Recording', (e as Error).message || 'Could not change recording state.');
    }
  };

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Socket for chat, host controls and signalling.
  useEffect(() => {
    let socket: Socket | null = null;
    (async () => {
      socket = await connectMeetingSocket(meetingId);
      socketRef.current = socket;
      socket.on('chat:message', (m: ChatMessage) => {
        setMessages((prev) => [...prev, m]);
        setUnread((u) => (chatOpen ? 0 : u + 1));
      });
      socket.on('meeting:ended', () => onLeave());
      socket.on('meeting:removed', () => onLeave());
      socket.on('host:mute', () => { localParticipant.setMicrophoneEnabled(false); });
      // Raise-hand state is shared over the socket: the server broadcasts participant:hand to
      // everyone in the room (including the sender), so each client mirrors the same map.
      socket.on('participant:hand', (p: { userId: string; raised: boolean }) => {
        setRaisedHands((prev) => ({ ...prev, [p.userId]: !!p.raised }));
      });
      socket.on('participant:left', (p: { userId: string }) => {
        setRaisedHands((prev) => { const next = { ...prev }; delete next[p.userId]; return next; });
      });
      socket.on('waiting:request', (r: { userId: string; name: string }) => {
        if (isHost) setWaiting((w) => (w.find((x) => x.userId === r.userId) ? w : [...w, { userId: r.userId, name: r.name }]));
      });
    })();
    return () => { socket?.close(); };
  }, [meetingId]);

  // Keep the host's waiting list current. Load immediately, then refresh on a timer so people
  // who knocked BEFORE the host joined (and any the socket event missed) always appear.
  useEffect(() => {
    if (!isHost) return;
    let active = true;
    const load = () =>
      roomApi.waiting(meetingId)
        .then((w) => { if (active) setWaiting(w.map((x) => ({ userId: x.userId, name: x.name }))); })
        .catch(() => undefined);
    load();
    const iv = setInterval(load, 5000);
    return () => { active = false; clearInterval(iv); };
  }, [isHost, meetingId]);

  const sendChat = () => {
    const text = draft.trim();
    if (!text || !socketRef.current) return;
    socketRef.current.emit('chat:send', { meetingId, text });
    setDraft('');
  };

  const toggleHand = () => {
    const next = !handRaised;
    setHandRaised(next);
    socketRef.current?.emit('hand:raise', { meetingId, raised: next });
  };

  const [sharingScreen, setSharingScreen] = useState(false);
  const toggleScreenShare = async () => {
    try {
      const next = !sharingScreen;
      // Starting share pops the OS screen-capture consent dialog; Android runs it in the
      // MediaProjection foreground service provided by react-native-webrtc.
      await localParticipant.setScreenShareEnabled(next);
      setSharingScreen(next);
    } catch (e) {
      Alert.alert('Screen share', (e as Error).message || 'Could not start screen sharing.');
    }
  };

  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const flipCamera = async () => {
    try {
      const pub = localParticipant.getTrackPublication(Track.Source.Camera)
        ?? [...localParticipant.videoTrackPublications.values()].find((p) => p.source === Track.Source.Camera);
      const track = (pub as unknown as { videoTrack?: unknown })?.videoTrack ?? pub?.track;
      if (!track || !isCameraEnabled) {
        Alert.alert('Camera', 'Turn your camera on first to switch between front and back.');
        return;
      }
      const next = facing === 'user' ? 'environment' : 'user';
      // LiveKit's own track restart is the reliable cross-device way to switch facing mode on
      // React Native; the raw _switchCamera() on the native track often does not update the
      // published stream.
      await (track as unknown as { restartTrack: (o: { facingMode: 'user' | 'environment' }) => Promise<void> })
        .restartTrack({ facingMode: next });
      setFacing(next);
    } catch (e) {
      Alert.alert('Camera', (e as Error).message || 'Could not switch camera.');
    }
  };

  const admit = async (userId: string | null) => {
    if (!userId) return;
    try {
      await roomApi.admit(meetingId, userId);
      setWaiting((w) => w.filter((x) => x.userId !== userId));
    } catch (e) {
      Alert.alert('Admit', (e as Error).message || 'Could not admit this participant.');
    }
  };
  const deny = async (userId: string | null) => {
    if (!userId) return;
    try {
      await roomApi.deny(meetingId, userId);
      setWaiting((w) => w.filter((x) => x.userId !== userId));
    } catch (e) {
      Alert.alert('Deny', (e as Error).message || 'Could not deny this participant.');
    }
  };

  const endForAll = async () => { try { await roomApi.end(meetingId); } finally { onLeave(); } };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const cameraTracks = tracks.filter((t) => isTrackReference(t));

  return (
    <SafeAreaView style={styles.root}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text variant="label" color={colors.roomText} numberOfLines={1}>{title}</Text>
          <Text variant="caption" color="rgba(255,255,255,0.6)">{mm}:{ss} · {participants.length} in call</Text>
        </View>
        {recording && (
          <View style={styles.recTag}>
            <View style={styles.recDot} />
            <Text variant="caption" color="#fff">REC</Text>
          </View>
        )}
        {isHost && (
          <Pressable style={styles.recBtn} onPress={toggleRecording}>
            <Ionicons name={recording ? 'stop-circle' : 'radio-button-on'} size={16} color={recording ? colors.danger : '#fff'} />
          </Pressable>
        )}
        {isHost && waiting.length > 0 && (
          <Pressable style={styles.waitingBadge} onPress={() => setPaxOpen(true)}>
            <Ionicons name="hourglass-outline" size={14} color="#fff" />
            <Text variant="caption" color="#fff">{waiting.length} waiting</Text>
          </Pressable>
        )}
      </View>

      {/* Grid */}
      <FlatList
        data={cameraTracks}
        key={cameraTracks.length > 1 ? 'two' : 'one'}
        numColumns={cameraTracks.length > 1 ? 2 : 1}
        keyExtractor={(item, idx) => `${item.participant.identity}-${idx}`}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <View style={[styles.tile, cameraTracks.length > 1 && styles.tileHalf]}>
            {isTrackReference(item) ? (
              <VideoTrack trackRef={item} style={styles.video} objectFit="cover" />
            ) : (
              <View style={styles.videoOff}><Ionicons name="person" size={40} color="rgba(255,255,255,0.4)" /></View>
            )}
            <View style={styles.nameTag}>
              <Text variant="caption" color="#fff">{item.participant.name || item.participant.identity}</Text>
            </View>
            {raisedHands[item.participant.identity] && (
              <View style={styles.handBadge}><Ionicons name="hand-left" size={16} color="#1B2F5B" /></View>
            )}
          </View>
        )}
      />

      {/* Controls */}
      <View style={styles.controls}>
        <Ctrl icon={isMicrophoneEnabled ? 'mic' : 'mic-off'} active={isMicrophoneEnabled} onPress={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)} />
        <Ctrl icon={isCameraEnabled ? 'videocam' : 'videocam-off'} active={isCameraEnabled} onPress={() => localParticipant.setCameraEnabled(!isCameraEnabled)} />
        <Ctrl icon="camera-reverse" onPress={flipCamera} />
        <Ctrl icon={sharingScreen ? 'stop-circle' : 'tv-outline'} active={sharingScreen} onPress={toggleScreenShare} />
        <Ctrl icon="hand-left" active={handRaised} onPress={toggleHand} />
        <Ctrl icon="chatbubble-ellipses" badge={unread} onPress={() => { setChatOpen(true); setUnread(0); }} />
        <Ctrl icon="people" onPress={() => setPaxOpen(true)} />
        <Ctrl icon="exit" danger onPress={onLeave} />
      </View>

      {/* Chat modal */}
      <Modal visible={chatOpen} animationType="slide" transparent onRequestClose={() => setChatOpen(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.sheet}>
            <SheetHeader title="Chat" onClose={() => setChatOpen(false)} />
            <FlatList
              data={messages}
              keyExtractor={(_, i) => String(i)}
              contentContainerStyle={styles.chatList}
              renderItem={({ item }) => (
                <View style={styles.msg}>
                  <Text variant="caption" color={colors.primary}>{item.name}</Text>
                  <Text variant="body">{item.text}</Text>
                </View>
              )}
              ListEmptyComponent={<Text variant="body" color={colors.textMuted} style={styles.center}>No messages yet.</Text>}
            />
            <View style={styles.chatInputRow}>
              <TextInput style={styles.chatInput} value={draft} onChangeText={setDraft} placeholder="Message" onSubmitEditing={sendChat} />
              <Pressable style={styles.sendBtn} onPress={sendChat}><Ionicons name="send" size={18} color="#fff" /></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Participants / waiting room modal */}
      <Modal visible={paxOpen} animationType="slide" transparent onRequestClose={() => setPaxOpen(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.sheet}>
            <SheetHeader title="Participants" onClose={() => setPaxOpen(false)} />
            {isHost && waiting.length > 0 && (
              <View style={styles.waitingSection}>
                <Text variant="label" color={colors.textMuted}>WAITING ROOM</Text>
                {waiting.map((w) => (
                  <View key={w.userId ?? w.name} style={styles.paxRow}>
                    <Text variant="body" style={{ flex: 1 }}>{w.name}</Text>
                    <Pressable style={styles.admitBtn} onPress={() => admit(w.userId)}><Text variant="label" color="#fff">Admit</Text></Pressable>
                    <Pressable style={styles.denyBtn} onPress={() => deny(w.userId)}><Text variant="label" color={colors.danger}>Deny</Text></Pressable>
                  </View>
                ))}
              </View>
            )}
            <Text variant="label" color={colors.textMuted} style={{ marginTop: spacing.md }}>IN CALL ({participants.length})</Text>
            {participants.map((p) => (
              <View key={p.identity} style={styles.paxRow}>
                <Text variant="body" style={{ flex: 1 }}>{p.name || p.identity}{p.isLocal ? ' (you)' : ''}</Text>
                {raisedHands[p.identity] && <Ionicons name="hand-left" size={16} color={colors.accent} />}
                <Ionicons name={p.isMicrophoneEnabled ? 'mic' : 'mic-off'} size={16} color={p.isMicrophoneEnabled ? colors.success : colors.textMuted} />
                {isHost && !p.isLocal && (
                  <Pressable style={styles.muteBtn} onPress={() => roomApi.mute(meetingId, p.identity)}><Text variant="caption" color={colors.primary}>Mute</Text></Pressable>
                )}
                {isHost && !p.isLocal && (
                  <Pressable style={styles.muteBtn} onPress={() => roomApi.remove(meetingId, p.identity)}><Text variant="caption" color={colors.danger}>Remove</Text></Pressable>
                )}
              </View>
            ))}
            {isHost && (
              <Pressable style={styles.endBtn} onPress={endForAll}><Text variant="label" color="#fff">End meeting for all</Text></Pressable>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Ctrl({ icon, onPress, active, danger, badge }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; active?: boolean; danger?: boolean; badge?: number }) {
  return (
    <Pressable style={[styles.ctrl, danger && styles.ctrlDanger, active && styles.ctrlActive]} onPress={onPress}>
      <Ionicons name={icon} size={22} color={danger ? '#fff' : active ? colors.primary : colors.roomText} />
      {!!badge && badge > 0 && <View style={styles.ctrlBadge}><Text variant="caption" color="#fff">{badge}</Text></View>}
    </Pressable>
  );
}

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={styles.sheetHeader}>
      <Text variant="heading">{title}</Text>
      <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color={colors.textMuted} /></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.roomBg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm },
  waitingBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  recTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(192,57,43,0.2)', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  recBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.roomBorder, alignItems: 'center', justifyContent: 'center' },
  grid: { flexGrow: 1, padding: spacing.sm, gap: spacing.sm },
  tile: { flex: 1, aspectRatio: 1, backgroundColor: colors.roomSurface, borderRadius: radius.md, overflow: 'hidden', margin: 4, minHeight: 200 },
  tileHalf: { aspectRatio: 0.75 },
  video: { flex: 1 },
  videoOff: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.roomSurface },
  nameTag: { position: 'absolute', left: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  handBadge: { position: 'absolute', right: 8, top: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: '#F4B740', alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.sm, backgroundColor: colors.roomSurface, borderTopColor: colors.roomBorder, borderTopWidth: 1 },
  ctrl: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.roomBorder },
  ctrlActive: { backgroundColor: '#fff' },
  ctrlDanger: { backgroundColor: colors.danger },
  ctrlBadge: { position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, maxHeight: '75%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  chatList: { gap: spacing.sm, paddingVertical: spacing.sm, flexGrow: 1 },
  msg: { gap: 2 },
  center: { textAlign: 'center', marginTop: spacing.lg },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  chatInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 16 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  waitingSection: { gap: spacing.sm, marginBottom: spacing.sm },
  paxRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  admitBtn: { backgroundColor: colors.success, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.sm },
  denyBtn: { borderWidth: 1, borderColor: colors.danger, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.sm },
  muteBtn: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  endBtn: { backgroundColor: colors.danger, padding: spacing.md, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.lg },
});
