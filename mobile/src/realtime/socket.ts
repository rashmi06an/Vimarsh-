import { io, Socket } from 'socket.io-client';
import { WS_BASE_URL } from '../config/env';
import { tokenStore } from '../auth/storage';

export interface ChatMessage {
  userId: string;
  name: string;
  text: string;
  at: string;
}

/** Connect a Socket.IO client authenticated with the current access token. */
export async function connectMeetingSocket(meetingId: string): Promise<Socket> {
  const token = await tokenStore.getAccess();
  const socket = io(WS_BASE_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
  });
  socket.on('connect', () => {
    socket.emit('meeting:subscribe', { meetingId });
  });
  return socket;
}
