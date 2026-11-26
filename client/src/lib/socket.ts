// Socket.IO 連線管理（單一連線，自動重連）
import { io, type Socket } from 'socket.io-client';
import { getToken } from './api';

let socket: Socket | null = null;
let currentToken: string | null = null;

export function connectSocket(token: string = getToken() || ''): Socket {
  if (socket && currentToken === token) return socket;
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  currentToken = token;
  socket = io({
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 700,
    reconnectionDelayMax: 4000,
  });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socket = null;
  currentToken = null;
}
