// 牌桌管理：買入、離桌、機器人補位、紀錄與統計
import { PokerTable } from '../poker/table.js';
import { BOT_PROFILES } from '../poker/bots.js';
import * as db from '../db.js';
import { progressMission, checkAchievements } from './progress.js';

export class TableManager {
  constructor() {
    this.tables = new Map();
    this.io = null;
    this.broadcastTimers = new Map();
    this.listTimer = null;
    this.botSeq = 0;
    this.tournamentHub = null;
  }

  attach(io) {
    this.io = io;
  }

  loadFromDb() {
    for (const rec of db.listTableRecords()) this.ensureTable(rec);
  }

  ensureTable(rec) {
    if (this.tables.has(rec.id)) return this.tables.get(rec.id);
    const table = new PokerTable({
      id: rec.id,
      name: rec.name,
      kind: rec.kind,
      maxPlayers: rec.maxPlayers,
      smallBlind: rec.smallBlind,
      bigBlind: rec.bigBlind,
      minBuyIn: rec.minBuyIn,
      maxBuyIn: rec.maxBuyIn,
      config: rec.config || {},
      clubId: rec.clubId || null,
      ownerId: rec.ownerId || null,
      code: rec.code || null,
      tournamentId: rec.tournamentId || null,
      hooks: {
        onUpdate: (t) => this.scheduleBroadcast(t),
        onEvent: (t, ev) => this.emitEvent(t, ev),
        onHandComplete: (t, summary) => this.handleHandComplete(t, summary),
        onPlayerBust: (t, seat) => this.handleBust(t, seat),
      },
    });
    this.tables.set(rec.id, table);
    return table;
  }

  getTable(id) {
    return this.tables.get(id) || null;
  }

  destroyTable(id) {
    const table = this.tables.get(id);
    if (table) {
      table.destroy();
      this.tables.delete(id);
    }
  }

  emitEvent(table, event) {
    if (!this.io) return;
    this.io.to(`table:${table.id}`).emit('table:event', { tableId: table.id, ...event });
  }

  scheduleBroadcast(table) {
    if (this.broadcastTimers.has(table.id)) return;
    const timer = setTimeout(() => {
      this.broadcastTimers.delete(table.id);
      this.broadcast(table);
    }, 60);
    this.broadcastTimers.set(table.id, timer);
  }

  broadcast(table) {
    if (!this.io) return;
    const room = `table:${table.id}`;
    const members = this.io.sockets.adapter.rooms.get(room);
    if (members) {
      for (const sid of members) {
        const socket = this.io.sockets.sockets.get(sid);
        if (socket && socket.data && socket.data.userId) {
          socket.emit('table:state', table.getStateFor(socket.data.userId));
        }
      }
    }
    this.scheduleTableList();
  }

  scheduleTableList() {
    if (this.listTimer) return;
    this.listTimer = setTimeout(() => {
      this.listTimer = null;
      if (this.io) this.io.emit('tables:update', this.listTables());
    }, 900);
  }

  publicTable(rec) {
    const table = this.tables.get(rec.id);
    const occupied = table ? table.occupiedSeats() : [];
    const humans = occupied.filter((s) => !s.isBot).length;
    return {
      id: rec.id,
      name: rec.name,
      kind: rec.kind,
      maxPlayers: rec.maxPlayers,
      players: occupied.length,
      humans,
      smallBlind: rec.smallBlind,
      bigBlind: rec.bigBlind,
      minBuyIn: rec.minBuyIn,
      maxBuyIn: rec.maxBuyIn,
      clubId: rec.clubId || null,
      ownerId: rec.ownerId || null,
      code: rec.code || null,
      hot: !!rec.hot,
      status: table ? table.state : 'waiting',
      handNo: table ? table.handNo : 0,
      avgStack: occupied.length
        ? Math.round(occupied.reduce((a, s) => a + s.stack, 0) / occupied.length)
        : 0,
      createdAt: rec.createdAt,
      private: rec.kind === 'private',
    };
  }

  listTables() {
    return db
      .listTableRecords()
      .filter((rec) => rec.kind !== 'private')
      .map((rec) => this.publicTable(rec));
  }

  listMyRooms(userId) {
    return db
      .listTableRecords()
      .filter((rec) => rec.kind === 'private' && rec.ownerId === userId)
      .map((rec) => this.publicTable(rec));
  }

  // ---------- 入座 / 離桌 ----------
  sit(tableId, user, buyIn, socketId) {
    const table = this.getTable(tableId);
    if (!table) return { ok: false, error: '找不到牌桌' };
    const existing = table.seatOf(user.id);
    if (existing) {
      existing.connected = true;
      if (socketId) existing.socketId = socketId;
      this.scheduleBroadcast(table);
      return { ok: true, seat: existing.seat, table };
    }
    if (table.findOpenSeat() < 0) {
      return { ok: false, error: '牌桌已滿' };
    }
    const minBuyIn = table.minBuyIn;
    if (user.chips < minBuyIn) return { ok: false, error: '積分不足，請先領取免費積分' };
    const amount = Math.max(minBuyIn, Math.min(Math.floor(buyIn || table.minBuyIn), table.maxBuyIn, user.chips));
    db.updateUser(user.id, { chips: user.chips - amount });
    const seat = table.seatPlayer({
      userId: user.id,
      name: user.displayName,
      avatar: user.avatar,
      level: user.level,
      stack: amount,
      isBot: false,
      socketId,
    });
    if (!seat) {
      db.updateUser(user.id, { chips: user.chips });
      return { ok: false, error: '牌桌已滿' };
    }
    seat.stackAtSync = amount;
    seat.buyIn = amount;
    if (!table.tournamentId) this.fillBots(table);
    this.scheduleBroadcast(table);
    return { ok: true, seat: seat.seat, table };
  }

  leave(tableId, userId) {
    const table = this.getTable(tableId);
    if (!table) return { ok: false, error: '找不到牌桌' };
    const seat = table.seatOf(userId);
    if (!seat) return { ok: false, error: '你不在這張牌桌' };
    if (!table.tournamentId) {
      const user = db.getUser(userId);
      if (user && seat.stack > 0) {
        db.updateUser(userId, { chips: user.chips + seat.stack });
      }
    }
    table.removePlayer(userId);
    this.scheduleBroadcast(table);
    return { ok: true, refund: seat.stack };
  }

  setConnected(tableId, userId, connected) {
    const table = this.getTable(tableId);
    if (!table) return;
    table.setConnected(userId, connected);
  }

  // ---------- 機器人 ----------
  fillBots(table, targetCount) {
    if (table.tournamentId) return;
    if (table.config && table.config.bots === false) return;
    const target = Math.min(targetCount || Math.min(table.maxPlayers, 5), table.maxPlayers);
    let guard = 0;
    while (table.occupiedSeats().length < target && guard < 12) {
      guard += 1;
      if (table.findOpenSeat() < 0) break;
      const profile = BOT_PROFILES[this.botSeq % BOT_PROFILES.length];
      this.botSeq += 1;
      const stack = Math.round(
        table.minBuyIn + Math.random() * Math.min(table.maxBuyIn - table.minBuyIn, table.minBuyIn * 3),
      );
      table.seatPlayer({
        userId: `bot_${table.id}_${Date.now().toString(36)}_${this.botSeq}`,
        name: profile.name,
        avatar: profile.avatar,
        level: 1 + Math.floor(Math.random() * 20),
        stack,
        isBot: true,
      });
    }
  }

  handleBust(table, seat) {
    if (table.tournamentId && this.tournamentHub) {
      this.tournamentHub.handleBust(table, seat);
      return;
    }
    if (seat.isBot) {
      table.removePlayer(seat.userId);
      setTimeout(() => this.fillBots(table), 1500);
      return;
    }
    const user = db.getUser(seat.userId);
    table.removePlayer(seat.userId);
    if (this.io) {
      this.io.to(`user:${seat.userId}`).emit('notify', {
        type: 'bust',
        text: '你的積分已用盡，可到大廳領取免費積分後再回來。',
        tableId: table.id,
      });
    }
    if (user) db.updateUser(user.id, { chips: Math.max(0, user.chips) });
    setTimeout(() => this.fillBots(table), 1200);
  }

  // ---------- 牌局結束處理 ----------
  handleHandComplete(table, summary) {
    const rec = db.getTableRecord(table.id);
    db.recordHand({ ...summary, tableName: table.name });
    const showdownSeats = summary.players.filter((p) => p.cards && p.cards.length === 2 && !p.folded);
    for (const p of summary.players) {
      if (p.isBot) continue;
      const user = db.getUser(p.userId);
      if (!user) continue;
      const stats = { ...db.DEFAULT_STATS, ...(user.stats || {}) };
      const handTypes = Array.isArray(stats.handTypes) ? stats.handTypes.slice() : new Array(10).fill(0);
      const won = summary.winners.find((w) => w.userId === p.userId);
      stats.handsPlayed += 1;
      stats.timePlayed += Math.max(0, Math.round((summary.endedAt - summary.startedAt) / 1000));
      if (won) {
        stats.handsWon += 1;
        stats.chipsWon += won.amount;
        stats.biggestPot = Math.max(stats.biggestPot, won.amount);
        if (typeof won.category === 'number' && won.category >= 0) {
          handTypes[won.category] = (handTypes[won.category] || 0) + 1;
        }
      } else {
        stats.chipsLost += p.committed || 0;
      }
      if (p.committed >= p.stack + (p.committed || 0) - 1 && p.committed > 0) {
        // 近似判斷是否 all-in（由 seat 狀態推得）
      }
      if (showdownSeats.some((s) => s.userId === p.userId)) {
        stats.showdowns += 1;
        if (won) stats.showdownWins += 1;
      }
      stats.handTypes = handTypes;
      db.bumpStats(user, stats);
      progressMission(user, 'play5', 1);
      progressMission(user, 'w_play40', 1);
      if (won) {
        progressMission(user, 'win2', 1);
        progressMission(user, 'w_win15', 1);
      }
      if (showdownSeats.some((s) => s.userId === p.userId)) progressMission(user, 'showdown1', 1);
      checkAchievements(user);
      const seat = table.seatOf(p.userId);
      if (seat && !table.tournamentId) {
        const synced = seat.stackAtSync || 0;
        const delta = seat.stack - synced;
        if (delta !== 0) {
          const fresh = db.getUser(p.userId);
          if (fresh) db.updateUser(p.userId, { chips: Math.max(0, fresh.chips + delta) });
        }
        seat.stackAtSync = seat.stack;
      }
    }
  }

  // ---------- 玩家行動 ----------
  act(tableId, userId, action, amount) {
    const table = this.getTable(tableId);
    if (!table) return { ok: false, error: '找不到牌桌' };
    const seat = table.seatOf(userId);
    if (!seat) return { ok: false, error: '你不在這張牌桌' };
    const result = table.act(seat.seat, action, amount);
    if (result.ok && (action === 'allin' || action === 'raise')) {
      const user = db.getUser(userId);
      if (user) {
        progressMission(user, 'allin1', 1);
        db.bumpStats(user, { allIns: ((user.stats && user.stats.allIns) || 0) + 1 });
      }
    }
    return result;
  }

  chat(tableId, user, text, kind = 'chat') {
    const table = this.getTable(tableId);
    if (!table) return null;
    const msg = {
      scope: 'table',
      scopeId: tableId,
      userId: user ? user.id : null,
      name: user ? user.displayName : '訪客',
      avatar: user ? user.avatar : 'a1',
      text: String(text || '').slice(0, 200),
      kind,
    };
    if (this.io) this.io.to(`table:${tableId}`).emit('table:chat', msg);
    if (kind === 'chat') db.addMessage(msg);
    return msg;
  }
}
