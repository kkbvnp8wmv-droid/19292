// Socket.IO 即時同步：牌桌狀態、行動、聊天、表情、斷線重連
import { Server } from 'socket.io';
import * as db from './db.js';

export function attachRealtime(httpServer, manager, hub) {
  const io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
    pingInterval: 12000,
    pingTimeout: 20000,
  });
  manager.attach(io);

  const disconnectTimers = new Map();

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    const user = token ? db.sessionUser(token) : null;
    if (!user) return next(new Error('unauthorized'));
    socket.data.userId = user.id;
    return next();
  });

  io.on('connection', (socket) => {
    const user = db.getUser(socket.data.userId);
    if (!user) {
      socket.disconnect(true);
      return;
    }
    socket.join(`user:${user.id}`);
    db.updateUser(user.id, { online: true });
    io.emit('presence:update', { userId: user.id, online: true });

    const pendingKey = `seat:${user.id}`;
    if (disconnectTimers.has(pendingKey)) {
      clearTimeout(disconnectTimers.get(pendingKey));
      disconnectTimers.delete(pendingKey);
    }

    socket.on('table:subscribe', ({ tableId } = {}) => {
      const table = manager.getTable(tableId);
      if (!table) {
        socket.emit('table:error', { error: '找不到牌桌' });
        return;
      }
      if (socket.data.tableId && socket.data.tableId !== tableId) {
        socket.leave(`table:${socket.data.tableId}`);
      }
      socket.join(`table:${tableId}`);
      socket.data.tableId = tableId;
      manager.setConnected(tableId, user.id, true);
      socket.emit('table:state', table.getStateFor(user.id));
      socket.emit('table:chat:history', { tableId, messages: db.listMessages('table', tableId, 40) });
    });

    socket.on('table:unsubscribe', ({ tableId } = {}) => {
      socket.leave(`table:${tableId}`);
      if (socket.data.tableId === tableId) socket.data.tableId = null;
    });

    socket.on('table:sit', ({ tableId, buyIn } = {}) => {
      const fresh = db.getUser(user.id);
      const result = manager.sit(tableId, fresh, Number(buyIn) || 0, socket.id);
      if (!result.ok) {
        socket.emit('table:error', { error: result.error });
        return;
      }
      socket.join(`table:${tableId}`);
      socket.data.tableId = tableId;
      socket.emit('table:seated', {
        tableId,
        seat: result.seat,
        user: db.publicUser(db.getUser(user.id)),
      });
      manager.broadcast(result.table);
    });

    socket.on('table:action', ({ tableId, action, amount } = {}) => {
      const result = manager.act(tableId, user.id, action, Number(amount) || 0);
      if (!result.ok) socket.emit('table:error', { error: result.error });
    });

    socket.on('table:leave', ({ tableId } = {}) => {
      const result = manager.leave(tableId, user.id);
      socket.leave(`table:${tableId}`);
      if (socket.data.tableId === tableId) socket.data.tableId = null;
      socket.emit('table:left', { tableId, refund: result.refund || 0 });
      socket.emit('wallet:update', { chips: db.getUser(user.id).chips });
    });

    socket.on('table:chat', ({ tableId, text, kind } = {}) => {
      manager.chat(tableId, user, text, kind === 'emote' ? 'emote' : 'chat');
    });

    socket.on('table:emote', ({ tableId, emote } = {}) => {
      manager.chat(tableId, user, String(emote || '').slice(0, 8), 'emote');
    });

    socket.on('club:subscribe', ({ clubId } = {}) => {
      socket.join(`club:${clubId}`);
      socket.emit('club:chat:history', {
        clubId,
        messages: db.listMessages('club', clubId, 40),
      });
    });

    socket.on('club:chat', ({ clubId, text } = {}) => {
      const member = db.membership(clubId, user.id);
      if (!member) return;
      const msg = {
        scope: 'club',
        scopeId: clubId,
        userId: user.id,
        name: user.displayName,
        avatar: user.avatar,
        text: String(text || '').slice(0, 200),
        kind: 'chat',
      };
      db.addMessage(msg);
      io.to(`club:${clubId}`).emit('club:chat', msg);
    });

    socket.on('tournament:subscribe', ({ tournamentId } = {}) => {
      socket.join(`tournament:${tournamentId}`);
      const rec = db.getTournamentRecord(tournamentId);
      if (rec) socket.emit('tournament:state', hub.view(rec));
    });

    socket.on('friend:dm', ({ toUserId, text } = {}) => {
      const rel = db.findFriendship(user.id, toUserId);
      if (!rel || rel.status !== 'accepted') return;
      const msg = {
        scope: 'dm',
        scopeId: [user.id, toUserId].sort().join(':'),
        userId: user.id,
        name: user.displayName,
        avatar: user.avatar,
        text: String(text || '').slice(0, 300),
        kind: 'chat',
      };
      db.addMessage(msg);
      io.to(`user:${toUserId}`).emit('friend:dm', msg);
      socket.emit('friend:dm', msg);
    });

    socket.on('disconnect', () => {
      db.updateUser(user.id, { online: false, lastSeen: Date.now() });
      io.emit('presence:update', { userId: user.id, online: false });
      const tableId = socket.data.tableId;
      if (!tableId) return;
      manager.setConnected(tableId, user.id, false);
      // 90 秒內重連可回到原座位與牌局狀態
      const timer = setTimeout(() => {
        disconnectTimers.delete(pendingKey);
        const table = manager.getTable(tableId);
        if (!table) return;
        const seat = table.seatOf(user.id);
        if (seat && !seat.connected) {
          manager.leave(tableId, user.id);
          io.to(`user:${user.id}`).emit('notify', {
            type: 'timeout',
            text: '你已離線超過 90 秒，座位已釋放（積分已退回）',
          });
        }
      }, 90000);
      disconnectTimers.set(pendingKey, timer);
    });
  });

  return io;
}
