// 錦標賽：報名、分桌、盲注升級、淘汰、合併、獎勵
import * as db from '../db.js';
import { BOT_PROFILES } from '../poker/bots.js';

const BLIND_LEVELS = (base) => {
  const levels = [];
  let sb = base;
  for (let i = 0; i < 12; i += 1) {
    levels.push({ smallBlind: Math.round(sb), bigBlind: Math.round(sb * 2) });
    sb *= 1.45;
  }
  return levels;
};

export class TournamentHub {
  constructor(manager) {
    this.manager = manager;
    this.instances = new Map();
    this.tickTimer = null;
    this.botSeq = 0;
  }

  start() {
    for (const rec of db.listTournamentRecords()) this.ensure(rec);
    this.tickTimer = setInterval(() => this.tick(), 5000);
  }

  ensure(rec) {
    if (this.instances.has(rec.id)) return this.instances.get(rec.id);
    const inst = {
      record: rec,
      entries: new Map(),
      tables: new Set(),
      level: rec.level || 0,
      levels: BLIND_LEVELS(rec.smallBlind),
      lastLevelAt: 0,
      status: rec.status || 'registering',
    };
    for (const e of db.tournamentEntries(rec.id)) {
      inst.entries.set(e.userId, {
        userId: e.userId,
        name: e.name,
        avatar: e.avatar,
        isBot: !!e.isBot,
        chips: e.chips || rec.startingStack,
        status: e.status || 'registered',
        place: e.place || null,
        tableId: e.tableId || null,
      });
    }
    this.instances.set(rec.id, inst);
    return inst;
  }

  get(id) {
    return this.instances.get(id) || null;
  }

  register(tournamentId, user) {
    const rec = db.getTournamentRecord(tournamentId);
    if (!rec) return { ok: false, error: '找不到賽事' };
    const inst = this.ensure(rec);
    if (inst.status !== 'registering') return { ok: false, error: '賽事已開始，無法報名' };
    if (inst.entries.has(user.id)) return { ok: false, error: '你已經報名了' };
    const humans = [...inst.entries.values()].filter((e) => !e.isBot).length;
    if (humans >= rec.maxPlayers) return { ok: false, error: '賽事已額滿' };
    const entry = {
      userId: user.id,
      name: user.displayName,
      avatar: user.avatar,
      isBot: false,
      chips: rec.startingStack,
      status: 'registered',
      place: null,
      tableId: null,
    };
    inst.entries.set(user.id, entry);
    db.addTournamentEntry({ tournamentId, userId: user.id, name: user.displayName, avatar: user.avatar, chips: rec.startingStack, status: 'registered', joinedAt: Date.now() });
    const s = db.getUser(user.id);
    if (s) db.bumpStats(s, { tournamentsPlayed: ((s.stats && s.stats.tournamentsPlayed) || 0) + 1 });
    return { ok: true, entry };
  }

  unregister(tournamentId, userId) {
    const inst = this.instances.get(tournamentId);
    if (!inst || inst.status !== 'registering') return { ok: false, error: '無法取消報名' };
    inst.entries.delete(userId);
    return { ok: true };
  }

  fillBots(inst) {
    const rec = inst.record;
    const humans = [...inst.entries.values()].filter((e) => !e.isBot);
    const minField = Math.min(rec.maxPlayers, Math.max(6, humans.length + 1));
    let guard = 0;
    while (inst.entries.size < minField && guard < 40) {
      guard += 1;
      const profile = BOT_PROFILES[this.botSeq % BOT_PROFILES.length];
      this.botSeq += 1;
      const id = `tbot_${rec.id}_${this.botSeq}`;
      inst.entries.set(id, {
        userId: id,
        name: profile.name,
        avatar: profile.avatar,
        isBot: true,
        chips: rec.startingStack,
        status: 'registered',
        place: null,
        tableId: null,
      });
    }
  }

  startTournament(tournamentId) {
    const rec = db.getTournamentRecord(tournamentId);
    if (!rec) return { ok: false, error: '找不到賽事' };
    const inst = this.ensure(rec);
    if (inst.status === 'running') return { ok: false, error: '賽事已在進行中' };
    this.fillBots(inst);
    inst.status = 'running';
    inst.lastLevelAt = Date.now();
    db.updateTournamentRecord(tournamentId, { status: 'running', startedAt: Date.now() });
    const players = [...inst.entries.values()];
    const perTable = Math.min(6, rec.maxPlayers);
    const tableCount = Math.max(1, Math.ceil(players.length / perTable));
    for (let i = 0; i < tableCount; i += 1) {
      const id = `${tournamentId}-t${i + 1}`;
      const blinds = inst.levels[0];
      const record = {
        id,
        name: `${rec.name} · 桌 ${i + 1}`,
        kind: 'tournament',
        maxPlayers: perTable,
        smallBlind: blinds.smallBlind,
        bigBlind: blinds.bigBlind,
        minBuyIn: rec.startingStack,
        maxBuyIn: rec.startingStack,
        ownerId: null,
        clubId: null,
        password: null,
        code: null,
        tournamentId,
        createdAt: Date.now(),
        config: { bots: false, actionTimeoutMs: 20000, nextHandDelay: 3000 },
      };
      db.createTableRecord(record);
      const table = this.manager.ensureTable(record);
      inst.tables.add(id);
      const group = players.slice(i * perTable, (i + 1) * perTable);
      for (const p of group) {
        const seat = table.seatPlayer({
          userId: p.userId,
          name: p.name,
          avatar: p.avatar,
          level: 1,
          stack: p.chips,
          isBot: p.isBot,
        });
        if (seat) {
          seat.tournamentStack = p.chips;
          p.status = 'playing';
          p.tableId = id;
          db.updateTournamentEntry(tournamentId, p.userId, { status: 'playing', tableId: id });
        }
      }
    }
    if (this.manager.io) {
      this.manager.io.emit('tournament:update', { tournamentId, status: 'running' });
    }
    return { ok: true };
  }

  handleBust(table, seat) {
    const inst = this.instances.get(table.tournamentId);
    if (!inst) return;
    const entry = inst.entries.get(seat.userId);
    table.removePlayer(seat.userId);
    if (!entry) return;
    const remaining = [...inst.entries.values()].filter((e) => e.status === 'playing').length;
    entry.status = 'eliminated';
    entry.place = remaining + 1;
    entry.chips = 0;
    db.updateTournamentEntry(inst.record.id, seat.userId, {
      status: 'eliminated',
      place: entry.place,
    });
    if (this.manager.io && !entry.isBot) {
      this.manager.io.to(`user:${seat.userId}`).emit('notify', {
        type: 'tournament',
        text: `你在「${inst.record.name}」獲得第 ${entry.place} 名`,
      });
    }
    this.rebalance(inst);
    this.checkFinish(inst);
  }

  rebalance(inst) {
    const liveTables = [...inst.tables]
      .map((id) => this.manager.getTable(id))
      .filter((t) => t && t.occupiedSeats().length > 0);
    if (liveTables.length <= 1) return;
    for (const table of liveTables) {
      const active = table.seats.filter((s) => s && s.stack > 0);
      if (active.length !== 1) continue;
      const player = active[0];
      const target = liveTables.find(
        (t) => t !== table && t.occupiedSeats().length < t.maxPlayers && t.state !== 'showdown',
      );
      if (!target) continue;
      const stack = player.stack;
      table.removePlayer(player.userId);
      const newSeat = target.seatPlayer({
        userId: player.userId,
        name: player.name,
        avatar: player.avatar,
        level: player.level,
        stack,
        isBot: player.isBot,
      });
      if (newSeat) {
        newSeat.stackAtSync = 0;
        const entry = inst.entries.get(player.userId);
        if (entry) {
          entry.tableId = target.id;
          db.updateTournamentEntry(inst.record.id, player.userId, { tableId: target.id });
        }
        if (this.manager.io) {
          this.manager.io.to(`user:${player.userId}`).emit('notify', {
            type: 'tournament',
            text: `重新分桌：你已被安排到「${target.name}」`,
            tableId: target.id,
          });
        }
      }
    }
    // 清空已無人的桌
    for (const table of liveTables) {
      if (table.occupiedSeats().length === 0) {
        inst.tables.delete(table.id);
        this.manager.destroyTable(table.id);
        db.removeTableRecord(table.id);
      }
    }
  }

  checkFinish(inst) {
    const playing = [...inst.entries.values()].filter((e) => e.status === 'playing');
    if (playing.length > 1) return;
    const winner = playing[0];
    inst.status = 'finished';
    db.updateTournamentRecord(inst.record.id, { status: 'finished', finishedAt: Date.now() });
    const results = [...inst.entries.values()]
      .sort((a, b) => (a.place || 99) - (b.place || 99))
      .map((e, i) => ({ ...e, place: e.place || (e === winner ? 1 : i + 1) }));
    if (winner) {
      winner.place = 1;
      winner.status = 'winner';
      db.updateTournamentEntry(inst.record.id, winner.userId, { status: 'winner', place: 1 });
      const prize = inst.record.prize || 5000;
      const payouts = [
        { place: 1, amount: Math.round(prize * 0.5) },
        { place: 2, amount: Math.round(prize * 0.3) },
        { place: 3, amount: Math.round(prize * 0.2) },
      ];
      for (const payout of payouts) {
        const e = results.find((r) => r.place === payout.place);
        if (!e || e.isBot) continue;
        const user = db.getUser(e.userId);
        if (!user) continue;
        db.updateUser(e.userId, { chips: user.chips + payout.amount });
        db.bumpStats(user, {
          tournamentsWon: payout.place === 1
            ? ((user.stats && user.stats.tournamentsWon) || 0) + 1
            : (user.stats && user.stats.tournamentsWon) || 0,
        });
        if (this.manager.io) {
          this.manager.io.to(`user:${e.userId}`).emit('notify', {
            type: 'tournament',
            text: `「${inst.record.name}」第 ${payout.place} 名，獲得 ${payout.amount} 積分！`,
          });
        }
      }
      db.addMessage({
        scope: 'tournament',
        scopeId: inst.record.id,
        userId: null,
        name: '系統',
        avatar: 'a1',
        text: `${winner.name} 贏得「${inst.record.name}」冠軍！`,
        kind: 'system',
      });
    }
    for (const id of inst.tables) {
      this.manager.destroyTable(id);
      db.removeTableRecord(id);
    }
    inst.tables.clear();
    if (this.manager.io) {
      this.manager.io.emit('tournament:update', { tournamentId: inst.record.id, status: 'finished' });
    }
  }

  tick() {
    const now = Date.now();
    for (const inst of this.instances.values()) {
      const rec = inst.record;
      if (inst.status === 'registering' && rec.startAt && now >= rec.startAt) {
        this.startTournament(rec.id);
      }
      if (inst.status === 'running' && rec.blindLevelMs) {
        if (now - inst.lastLevelAt >= rec.blindLevelMs) {
          inst.lastLevelAt = now;
          inst.level = Math.min(inst.level + 1, inst.levels.length - 1);
          const blinds = inst.levels[inst.level];
          for (const tableId of inst.tables) {
            const table = this.manager.getTable(tableId);
            if (table) {
              table.smallBlind = blinds.smallBlind;
              table.bigBlind = blinds.bigBlind;
              table.addLog(`盲注升級：${blinds.smallBlind}/${blinds.bigBlind}`);
              this.manager.scheduleBroadcast(table);
            }
          }
          db.updateTournamentRecord(rec.id, { level: inst.level });
          if (this.manager.io) {
            this.manager.io.emit('tournament:update', {
              tournamentId: rec.id,
              level: inst.level,
              blinds,
            });
          }
        }
      }
    }
  }

  view(rec) {
    const inst = this.ensure(rec);
    const entries = [...inst.entries.values()]
      .sort((a, b) => (a.place || 999) - (b.place || 999))
      .map((e) => ({
        userId: e.userId,
        name: e.name,
        avatar: e.avatar,
        chips: e.chips,
        status: e.status,
        place: e.place,
        isBot: e.isBot,
        tableId: e.tableId,
      }));
    const blinds = inst.levels[inst.level] || { smallBlind: rec.smallBlind, bigBlind: rec.bigBlind };
    return {
      ...rec,
      status: inst.status,
      level: inst.level,
      blinds,
      entries,
      registered: entries.filter((e) => e.status === 'registered').length,
      playing: entries.filter((e) => e.status === 'playing').length,
      tables: [...inst.tables],
    };
  }
}
