// REST API：認證、玩家、牌桌、房間、賽事、俱樂部、好友、排行榜
import { Router } from 'express';
import * as db from '../db.js';
import {
  missionsView,
  claimMission,
  dailyReward,
  achievementsView,
  statsView,
  rankTitle,
  checkAchievements,
  progressMission,
} from '../game/progress.js';

const ok = (res, payload) => res.json({ ok: true, ...payload });
const fail = (res, status, error) => res.status(status).json({ ok: false, error });

function code6() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function createApi(manager, hub) {
  const router = Router();

  router.use((req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token || '';
    req.token = token;
    req.user = token ? db.sessionUser(token) : null;
    next();
  });

  const auth = (req, res, next) => (req.user ? next() : fail(res, 401, '請先登入'));

  const safeUser = (user) => {
    if (!user) return null;
    const pub = db.publicUser(user);
    return { ...pub, rank: rankTitle(user.level), token: undefined };
  };

  // ---------- 認證 ----------
  router.post('/auth/register', (req, res) => {
    const { username, password, displayName, avatar } = req.body || {};
    if (!username || String(username).trim().length < 3) return fail(res, 400, '暱稱至少 3 個字元');
    if (!password || String(password).length < 4) return fail(res, 400, '密碼至少 4 個字元');
    if (db.findUserByName(username)) return fail(res, 400, '此暱稱已被使用');
    const record = db.newUserRecord({
      username: String(username).trim(),
      password: String(password),
      displayName: displayName || String(username).trim(),
      avatar: avatar || 'a1',
    });
    db.createUser(record);
    const token = db.createSession(record.id);
    ok(res, { token, user: safeUser(record) });
  });

  router.post('/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    const user = db.findUserByName(username);
    if (!user) return fail(res, 401, '找不到此帳號');
    if (user.isGuest) return fail(res, 401, '遊客帳號無法登入，請註冊');
    if (!db.verifyPassword(String(password || ''), user.salt, user.passHash)) {
      return fail(res, 401, '密碼錯誤');
    }
    const token = db.createSession(user.id);
    ok(res, { token, user: safeUser(user) });
  });

  router.post('/auth/guest', (req, res) => {
    const { displayName, avatar } = req.body || {};
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const username = `guest_${Date.now().toString(36)}${suffix}`;
    const record = db.newUserRecord({
      username,
      password: null,
      displayName: displayName || `訪客${suffix}`,
      avatar: avatar || 'a2',
      isGuest: true,
    });
    db.createUser(record);
    const token = db.createSession(record.id);
    ok(res, { token, user: safeUser(record) });
  });

  router.post('/auth/logout', auth, (req, res) => {
    db.deleteSession(req.token);
    ok(res, {});
  });

  router.get('/me', auth, (req, res) => {
    db.updateUser(req.user.id, { lastSeen: Date.now() });
    ok(res, { user: safeUser(req.user), missions: missionsView(req.user) });
  });

  router.patch('/me', auth, (req, res) => {
    const { displayName, avatar, bio, country } = req.body || {};
    const patch = {};
    if (displayName && String(displayName).trim().length >= 2) patch.displayName = String(displayName).trim().slice(0, 16);
    if (avatar) patch.avatar = String(avatar).slice(0, 12);
    if (typeof bio === 'string') patch.bio = bio.slice(0, 120);
    if (country) patch.country = String(country).slice(0, 4);
    db.updateUser(req.user.id, patch);
    ok(res, { user: safeUser(db.getUser(req.user.id)) });
  });

  router.patch('/me/settings', auth, (req, res) => {
    const settings = { ...db.DEFAULT_SETTINGS, ...(req.user.settings || {}), ...(req.body || {}) };
    db.updateUser(req.user.id, { settings });
    ok(res, { settings });
  });

  router.post('/me/daily', auth, (req, res) => {
    const result = dailyReward(req.user);
    if (!result.ok) return fail(res, 400, result.error);
    ok(res, { ...result, user: safeUser(db.getUser(req.user.id)) });
  });

  router.get('/me/stats', auth, (req, res) => {
    ok(res, { stats: statsView(req.user) });
  });

  router.get('/me/hands', auth, (req, res) => {
    ok(res, { hands: db.userHands(req.user.id, 40) });
  });

  router.get('/me/achievements', auth, (req, res) => {
    ok(res, { achievements: achievementsView(req.user) });
  });

  router.get('/me/notifications', auth, (req, res) => {
    const incoming = db
      .friendshipsOf(req.user.id)
      .filter((f) => f.toId === req.user.id && f.status === 'pending')
      .map((f) => {
        const from = db.getUser(f.fromId);
        return {
          id: f.id,
          type: 'friend_request',
          text: `${from ? from.displayName : '玩家'} 想加你為好友`,
          avatar: from ? from.avatar : 'a1',
          userId: f.fromId,
          createdAt: f.createdAt,
        };
      });
    const notices = (manager.notifications.get(req.user.id) || []).slice(-20).reverse();
    ok(res, { notifications: [...incoming, ...notices] });
  });

  // ---------- 任務 ----------
  router.get('/missions', auth, (req, res) => {
    ok(res, { missions: missionsView(req.user) });
  });

  router.post('/missions/:id/claim', auth, (req, res) => {
    const result = claimMission(req.user, req.params.id);
    if (!result.ok) return fail(res, 400, result.error);
    ok(res, { ...result, user: safeUser(db.getUser(req.user.id)) });
  });

  // ---------- 牌桌 ----------
  router.get('/tables', (req, res) => {
    const { size, kind } = req.query;
    let tables = manager.listTables();
    if (size) tables = tables.filter((t) => String(t.maxPlayers) === String(size));
    if (kind === 'beginner') tables = tables.filter((t) => t.kind === 'beginner');
    if (kind === 'club') tables = tables.filter((t) => t.kind === 'club');
    if (kind === 'hot') tables = tables.filter((t) => t.hot);
    ok(res, { tables });
  });

  router.get('/tables/:id', (req, res) => {
    const rec = db.getTableRecord(req.params.id);
    if (!rec) return fail(res, 404, '找不到牌桌');
    const info = manager.publicTable(rec);
    const table = manager.getTable(rec.id);
    ok(res, {
      table: {
        ...info,
        seats: table
          ? table.seats.map((s) =>
              s
                ? { seat: s.seat, name: s.name, avatar: s.avatar, stack: s.stack, isBot: s.isBot }
                : null,
            )
          : [],
      },
    });
  });

  router.post('/tables/quick', auth, (req, res) => {
    const size = Number(req.query.size || req.body?.size || 0);
    const candidates = manager
      .listTables()
      .filter((t) => t.players < t.maxPlayers)
      .filter((t) => (size ? t.maxPlayers === size : true))
      .filter((t) => req.user.chips >= t.minBuyIn)
      .sort((a, b) => b.humans - a.humans || b.players - a.players);
    let target = candidates[0];
    if (!target) {
      const fallback = manager.listTables().filter((t) => req.user.chips >= t.minBuyIn)[0];
      if (!fallback) return fail(res, 400, '目前沒有適合你的牌桌，請先領取免費積分');
      target = fallback;
    }
    const rec = db.getTableRecord(target.id);
    if (!rec) return fail(res, 400, '找不到牌桌');
    const defaultBuyIn = Math.max(
      rec.minBuyIn,
      Math.min(rec.maxBuyIn, Math.floor(req.user.chips * 0.25)),
    );
    const joined = manager.sit(rec.id, req.user, defaultBuyIn);
    if (!joined.ok) return fail(res, 400, joined.error);
    ok(res, {
      tableId: rec.id,
      table: target,
      seat: joined.seat,
      user: safeUser(db.getUser(req.user.id)),
    });
  });

  router.post('/tables/:id/join', auth, (req, res) => {
    const rec = db.getTableRecord(req.params.id);
    if (!rec) return fail(res, 404, '找不到牌桌');
    if (rec.kind === 'private' && rec.ownerId !== req.user.id) {
      if (rec.password && String(req.body?.password || '') !== rec.password) {
        return fail(res, 403, '房間密碼錯誤');
      }
      if (rec.config && rec.config.locked) return fail(res, 403, '房主已鎖定房間');
    }
    const result = manager.sit(rec.id, req.user, Number(req.body?.buyIn || rec.minBuyIn));
    if (!result.ok) return fail(res, 400, result.error);
    ok(res, {
      tableId: rec.id,
      seat: result.seat,
      user: safeUser(db.getUser(req.user.id)),
    });
  });

  router.post('/tables/:id/leave', auth, (req, res) => {
    const result = manager.leave(req.params.id, req.user.id);
    if (!result.ok) return fail(res, 400, result.error);
    ok(res, { refund: result.refund, user: safeUser(db.getUser(req.user.id)) });
  });

  router.get('/tables/:id/chat', (req, res) => {
    ok(res, { messages: db.listMessages('table', req.params.id, 40) });
  });

  // ---------- 私人房間 ----------
  router.get('/rooms', auth, (req, res) => {
    ok(res, { rooms: manager.listMyRooms(req.user.id) });
  });

  router.post('/rooms', auth, (req, res) => {
    const {
      name, password, maxPlayers, smallBlind, bigBlind, minBuyIn, maxBuyIn, bots, actionTimeoutMs,
    } = req.body || {};
    const sb = Math.max(1, Number(smallBlind) || 10);
    const bb = Math.max(2, Number(bigBlind) || sb * 2);
    const record = {
      id: `room-${Date.now().toString(36)}`,
      name: String(name || `${req.user.displayName} 的私人房間`).slice(0, 24),
      kind: 'private',
      maxPlayers: Math.min(9, Math.max(2, Number(maxPlayers) || 6)),
      smallBlind: sb,
      bigBlind: bb,
      minBuyIn: Math.max(bb * 5, Number(minBuyIn) || bb * 20),
      maxBuyIn: Math.max(bb * 20, Number(maxBuyIn) || bb * 100),
      ownerId: req.user.id,
      clubId: null,
      password: password ? String(password).slice(0, 20) : null,
      code: code6(),
      createdAt: Date.now(),
      config: {
        bots: bots !== false,
        actionTimeoutMs: Number(actionTimeoutMs) || 25000,
        locked: false,
      },
    };
    db.createTableRecord(record);
    manager.ensureTable(record);
    ok(res, { room: manager.publicTable(record) });
  });

  router.post('/rooms/join', auth, (req, res) => {
    const { code, password } = req.body || {};
    const rec = db
      .listTableRecords()
      .find((r) => r.kind === 'private' && String(r.code).toUpperCase() === String(code || '').toUpperCase());
    if (!rec) return fail(res, 404, '邀請碼無效');
    if (rec.password && String(password || '') !== rec.password) return fail(res, 403, '房間密碼錯誤');
    if (rec.config && rec.config.locked && rec.ownerId !== req.user.id) {
      return fail(res, 403, '房主已鎖定房間');
    }
    ok(res, { tableId: rec.id, room: manager.publicTable(rec) });
  });

  router.post('/rooms/:id/kick', auth, (req, res) => {
    const rec = db.getTableRecord(req.params.id);
    if (!rec || rec.kind !== 'private') return fail(res, 404, '找不到房間');
    if (rec.ownerId !== req.user.id) return fail(res, 403, '只有房主可以移除玩家');
    const targetId = req.body?.userId;
    manager.leave(rec.id, targetId);
    if (manager.io) {
      manager.io.to(`user:${targetId}`).emit('notify', { type: 'kicked', text: '你已被房主移出房間', tableId: rec.id });
      manager.io.to(`user:${targetId}`).emit('room:kicked', { tableId: rec.id });
    }
    ok(res, {});
  });

  router.post('/rooms/:id/lock', auth, (req, res) => {
    const rec = db.getTableRecord(req.params.id);
    if (!rec || rec.kind !== 'private') return fail(res, 404, '找不到房間');
    if (rec.ownerId !== req.user.id) return fail(res, 403, '只有房主可以鎖定房間');
    const locked = !!req.body?.locked;
    db.updateTableRecord(rec.id, { config: { ...rec.config, locked } });
    ok(res, { locked });
  });

  router.delete('/rooms/:id', auth, (req, res) => {
    const rec = db.getTableRecord(req.params.id);
    if (!rec || rec.kind !== 'private') return fail(res, 404, '找不到房間');
    if (rec.ownerId !== req.user.id) return fail(res, 403, '只有房主可以關閉房間');
    manager.destroyTable(rec.id);
    db.removeTableRecord(rec.id);
    ok(res, {});
  });

  // ---------- 賽事 ----------
  router.get('/tournaments', (req, res) => {
    ok(res, { tournaments: db.listTournamentRecords().map((rec) => hub.view(rec)) });
  });

  router.get('/tournaments/:id', (req, res) => {
    const rec = db.getTournamentRecord(req.params.id);
    if (!rec) return fail(res, 404, '找不到賽事');
    ok(res, { tournament: hub.view(rec), messages: db.listMessages('tournament', rec.id, 30) });
  });

  router.post('/tournaments/:id/register', auth, (req, res) => {
    const result = hub.register(req.params.id, req.user);
    if (!result.ok) return fail(res, 400, result.error);
    const rec = db.getTournamentRecord(req.params.id);
    ok(res, { tournament: hub.view(rec) });
  });

  router.post('/tournaments/:id/unregister', auth, (req, res) => {
    const result = hub.unregister(req.params.id, req.user.id);
    if (!result.ok) return fail(res, 400, result.error);
    ok(res, { tournament: hub.view(db.getTournamentRecord(req.params.id)) });
  });

  router.post('/tournaments/:id/start', auth, (req, res) => {
    const rec = db.getTournamentRecord(req.params.id);
    if (!rec) return fail(res, 404, '找不到賽事');
    const inst = hub.ensure(rec);
    const isRegistered = inst.entries.has(req.user.id);
    if (!isRegistered && !req.user.isAdmin) return fail(res, 403, '需先報名才能開始賽事');
    const result = hub.startTournament(rec.id);
    if (!result.ok) return fail(res, 400, result.error);
    ok(res, { tournament: hub.view(rec) });
  });

  // ---------- 俱樂部 ----------
  router.get('/clubs', (req, res) => {
    ok(res, {
      clubs: db.listClubs().map((club) => {
        const members = db.clubMembers(club.id);
        return {
          ...club,
          members: members.length,
          online: members.filter((m) => {
            const u = db.getUser(m.userId);
            return u && u.online;
          }).length,
        };
      }),
    });
  });

  router.post('/clubs', auth, (req, res) => {
    const { name, description, joinMode, logo } = req.body || {};
    if (!name || String(name).trim().length < 2) return fail(res, 400, '請輸入俱樂部名稱');
    const club = {
      id: db.uid('club'),
      name: String(name).trim().slice(0, 24),
      tag: String(name).trim().slice(0, 5).toUpperCase(),
      logo: logo || 'gold',
      description: String(description || '歡迎加入我們的撲克俱樂部！').slice(0, 200),
      announcement: '歡迎新成員加入！',
      joinMode: joinMode === 'approval' ? 'approval' : 'open',
      ownerId: req.user.id,
      createdAt: Date.now(),
      xp: 0,
    };
    db.createClub(club);
    db.addMember(club.id, req.user.id, 'founder');
    checkAchievements(req.user);
    ok(res, { club });
  });

  router.get('/clubs/:id', auth, (req, res) => {
    const club = db.getClub(req.params.id);
    if (!club) return fail(res, 404, '找不到俱樂部');
    const members = db.clubMembers(club.id).map((m) => {
      const u = db.getUser(m.userId);
      return {
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        name: u ? u.displayName : '已刪除玩家',
        avatar: u ? u.avatar : 'a1',
        level: u ? u.level : 1,
        chips: u ? u.chips : 0,
        online: u ? !!u.online : false,
        handsWon: u && u.stats ? u.stats.handsWon : 0,
      };
    });
    const tables = manager
      .listTables()
      .filter((t) => t.clubId === club.id);
    const mine = db.membership(club.id, req.user.id);
    ok(res, {
      club,
      members,
      tables,
      myRole: mine ? mine.role : null,
      messages: db.listMessages('club', club.id, 40),
    });
  });

  router.post('/clubs/:id/join', auth, (req, res) => {
    const club = db.getClub(req.params.id);
    if (!club) return fail(res, 404, '找不到俱樂部');
    if (db.membership(club.id, req.user.id)) return fail(res, 400, '你已是俱樂部成員');
    if (club.joinMode === 'approval') {
      manager.notifications.set(club.ownerId, [
        ...(manager.notifications.get(club.ownerId) || []),
        {
          id: db.uid('n'),
          type: 'club_apply',
          text: `${req.user.displayName} 申請加入「${club.name}」`,
          clubId: club.id,
          userId: req.user.id,
          createdAt: Date.now(),
        },
      ]);
      return ok(res, { pending: true });
    }
    db.addMember(club.id, req.user.id, 'member');
    checkAchievements(req.user);
    ok(res, { joined: true });
  });

  router.post('/clubs/:id/leave', auth, (req, res) => {
    const club = db.getClub(req.params.id);
    if (!club) return fail(res, 404, '找不到俱樂部');
    if (club.ownerId === req.user.id) return fail(res, 400, '創辦人無法退出俱樂部，請轉讓或關閉');
    db.removeMember(club.id, req.user.id);
    ok(res, {});
  });

  router.post('/clubs/:id/announcement', auth, (req, res) => {
    const club = db.getClub(req.params.id);
    if (!club) return fail(res, 404, '找不到俱樂部');
    const mine = db.membership(club.id, req.user.id);
    if (!mine || !['founder', 'admin', 'officer'].includes(mine.role)) {
      return fail(res, 403, '權限不足');
    }
    const text = String(req.body?.announcement || '').slice(0, 300);
    club.announcement = text;
    db.persist();
    manager.io?.to(`club:${club.id}`).emit('club:announcement', { clubId: club.id, text });
    ok(res, { club });
  });

  router.post('/clubs/:id/role', auth, (req, res) => {
    const club = db.getClub(req.params.id);
    if (!club) return fail(res, 404, '找不到俱樂部');
    const mine = db.membership(club.id, req.user.id);
    if (!mine || !['founder', 'admin'].includes(mine.role)) return fail(res, 403, '權限不足');
    const { userId, role } = req.body || {};
    if (!['admin', 'officer', 'member'].includes(role)) return fail(res, 400, '職位無效');
    db.setMemberRole(club.id, userId, role);
    ok(res, {});
  });

  router.delete('/clubs/:id/members/:userId', auth, (req, res) => {
    const club = db.getClub(req.params.id);
    if (!club) return fail(res, 404, '找不到俱樂部');
    const mine = db.membership(club.id, req.user.id);
    if (!mine || !['founder', 'admin'].includes(mine.role)) return fail(res, 403, '權限不足');
    if (req.params.userId === club.ownerId) return fail(res, 400, '無法移除創辦人');
    db.removeMember(club.id, req.params.userId);
    ok(res, {});
  });

  router.post('/clubs/:id/tables', auth, (req, res) => {
    const club = db.getClub(req.params.id);
    if (!club) return fail(res, 404, '找不到俱樂部');
    const mine = db.membership(club.id, req.user.id);
    if (!mine || !['founder', 'admin', 'officer'].includes(mine.role)) return fail(res, 403, '權限不足');
    const { name, maxPlayers, smallBlind, bigBlind } = req.body || {};
    const sb = Math.max(1, Number(smallBlind) || 10);
    const record = {
      id: `clubtbl-${Date.now().toString(36)}`,
      name: String(name || `${club.name} 俱樂部桌`).slice(0, 24),
      kind: 'club',
      maxPlayers: Math.min(9, Math.max(2, Number(maxPlayers) || 6)),
      smallBlind: sb,
      bigBlind: Math.max(2, Number(bigBlind) || sb * 2),
      minBuyIn: sb * 20,
      maxBuyIn: sb * 200,
      ownerId: req.user.id,
      clubId: club.id,
      password: null,
      code: null,
      createdAt: Date.now(),
      config: { bots: true, actionTimeoutMs: 20000 },
    };
    db.createTableRecord(record);
    manager.ensureTable(record);
    ok(res, { table: manager.publicTable(record) });
  });

  // ---------- 好友 ----------
  router.get('/friends', auth, (req, res) => {
    const rels = db.friendshipsOf(req.user.id);
    const friends = [];
    const incoming = [];
    const outgoing = [];
    const blocked = [];
    for (const rel of rels) {
      const otherId = rel.fromId === req.user.id ? rel.toId : rel.fromId;
      const other = db.getUser(otherId);
      if (!other) continue;
      const card = {
        relationId: rel.id,
        userId: other.id,
        name: other.displayName,
        avatar: other.avatar,
        level: other.level,
        chips: other.chips,
        online: !!other.online,
        handsWon: other.stats ? other.stats.handsWon : 0,
        status: rel.status,
        createdAt: rel.createdAt,
      };
      if (rel.status === 'blocked') blocked.push(card);
      else if (rel.status === 'accepted') friends.push(card);
      else if (rel.toId === req.user.id) incoming.push(card);
      else outgoing.push(card);
    }
    ok(res, { friends, incoming, outgoing, blocked });
  });

  router.get('/friends/search', auth, (req, res) => {
    const q = String(req.query.q || '').toLowerCase().trim();
    if (q.length < 1) return ok(res, { players: [] });
    const players = Object.values(db.getData().users)
      .filter((u) => u.id !== req.user.id && !u.isGuest)
      .filter((u) => u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
      .slice(0, 20)
      .map((u) => {
        const rel = db.findFriendship(req.user.id, u.id);
        return {
          userId: u.id,
          name: u.displayName,
          avatar: u.avatar,
          level: u.level,
          online: !!u.online,
          relation: rel ? rel.status : null,
          relationId: rel ? rel.id : null,
        };
      });
    ok(res, { players });
  });

  router.post('/friends/request', auth, (req, res) => {
    const targetId = req.body?.userId;
    const target = db.getUser(targetId);
    if (!target) return fail(res, 404, '找不到玩家');
    if (targetId === req.user.id) return fail(res, 400, '不能加自己為好友');
    const existing = db.findFriendship(req.user.id, targetId);
    if (existing) return fail(res, 400, '已有好友關係或邀請');
    const rel = db.addFriendship(req.user.id, targetId, 'pending');
    manager.io?.to(`user:${targetId}`).emit('notify', {
      type: 'friend_request',
      text: `${req.user.displayName} 想加你為好友`,
      userId: req.user.id,
    });
    ok(res, { relation: rel });
  });

  router.post('/friends/accept', auth, (req, res) => {
    const rel = db.getData().friendships.find((f) => f.id === req.body?.id);
    if (!rel || rel.toId !== req.user.id) return fail(res, 404, '找不到邀請');
    db.updateFriendship(rel.id, { status: 'accepted' });
    manager.io?.to(`user:${rel.fromId}`).emit('notify', {
      type: 'friend_accept',
      text: `${req.user.displayName} 接受了你的好友邀請`,
      userId: req.user.id,
    });
    ok(res, {});
  });

  router.post('/friends/decline', auth, (req, res) => {
    const rel = db.getData().friendships.find((f) => f.id === req.body?.id);
    if (!rel || rel.toId !== req.user.id) return fail(res, 404, '找不到邀請');
    db.removeFriendship(rel.id);
    ok(res, {});
  });

  router.post('/friends/block', auth, (req, res) => {
    const targetId = req.body?.userId;
    const existing = db.findFriendship(req.user.id, targetId);
    if (existing) db.updateFriendship(existing.id, { status: 'blocked', fromId: req.user.id, toId: targetId });
    else db.addFriendship(req.user.id, targetId, 'blocked');
    ok(res, {});
  });

  router.delete('/friends/:id', auth, (req, res) => {
    const rel = db.getData().friendships.find((f) => f.id === req.params.id);
    if (!rel || (rel.fromId !== req.user.id && rel.toId !== req.user.id)) {
      return fail(res, 404, '找不到好友關係');
    }
    db.removeFriendship(rel.id);
    ok(res, {});
  });

  router.post('/friends/invite', auth, (req, res) => {
    const { userId, tableId, tournamentId } = req.body || {};
    const table = tableId ? db.getTableRecord(tableId) : null;
    const text = tournamentId
      ? `${req.user.displayName} 邀請你參加賽事`
      : `${req.user.displayName} 邀請你加入牌桌「${table ? table.name : ''}」`;
    manager.io?.to(`user:${userId}`).emit('notify', {
      type: 'invite',
      text,
      tableId: tableId || null,
      tournamentId: tournamentId || null,
      userId: req.user.id,
    });
    ok(res, {});
  });

  // ---------- 排行榜 ----------
  router.get('/leaderboard', auth, (req, res) => {
    const scope = String(req.query.scope || 'global');
    const metric = String(req.query.metric || 'chips');
    let pool = Object.values(db.getData().users).filter((u) => !u.isBot);
    if (scope === 'friends') {
      const friendIds = new Set(
        db
          .friendshipsOf(req.user.id)
          .filter((f) => f.status === 'accepted')
          .map((f) => (f.fromId === req.user.id ? f.toId : f.fromId)),
      );
      friendIds.add(req.user.id);
      pool = pool.filter((u) => friendIds.has(u.id));
    } else if (scope === 'club' && req.user.clubId) {
      const ids = new Set(db.clubMembers(req.user.clubId).map((m) => m.userId));
      pool = pool.filter((u) => ids.has(u.id));
    }
    const value = (u) => {
      if (metric === 'level') return u.level * 100000 + u.xp;
      if (metric === 'wins') return (u.stats?.handsWon || 0) * 1000 + (u.stats?.handsPlayed || 0);
      if (metric === 'tournaments') return (u.stats?.tournamentsWon || 0) * 1000 + (u.stats?.tournamentsPlayed || 0);
      return u.chips;
    };
    const rows = pool
      .map((u) => ({
        userId: u.id,
        name: u.displayName,
        avatar: u.avatar,
        level: u.level,
        chips: u.chips,
        rank: rankTitle(u.level),
        handsWon: u.stats?.handsWon || 0,
        handsPlayed: u.stats?.handsPlayed || 0,
        tournamentsWon: u.stats?.tournamentsWon || 0,
        value: value(u),
        isMe: u.id === req.user.id,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 50)
      .map((row, i) => ({ ...row, position: i + 1 }));
    ok(res, { rows, scope, metric });
  });

  router.get('/players/:id', auth, (req, res) => {
    const user = db.getUser(req.params.id);
    if (!user) return fail(res, 404, '找不到玩家');
    const rel = db.findFriendship(req.user.id, user.id);
    ok(res, {
      player: {
        ...db.publicUser(user),
        rank: rankTitle(user.level),
        relation: rel ? rel.status : null,
        relationId: rel ? rel.id : null,
      },
      hands: db.userHands(user.id, 10),
    });
  });

  router.get('/announcements', (req, res) => {
    ok(res, {
      announcements: [
        { id: 'a1', title: '歡迎來到 Poker Club', body: '全新俱樂部賽季開跑，完成每日任務即可獲得金幣與限定稱號。', tag: '公告' },
        { id: 'a2', title: '週末金冠賽', body: '每週六 21:00 開賽，冠軍獨得 30,000 積分。', tag: '活動' },
        { id: 'a3', title: '新手友善桌', body: '新手桌盲注較低，適合熟悉德州撲克流程。', tag: '提示' },
      ],
    });
  });

  router.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

  return router;
}
