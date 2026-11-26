// 檔案型資料庫（JSON 持久化，原子寫入 + 去抖動）
// 存放：玩家帳號、個人資料、牌局紀錄、俱樂部、好友、房間、賽事、訊息
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = process.env.POKER_DATA_DIR || path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'poker-club.json');

const emptyData = () => ({
  users: {},
  sessions: {},
  hands: [],
  friendships: [],
  clubs: {},
  clubMembers: [],
  tables: {},
  tournaments: {},
  entries: [],
  messages: [],
  meta: { createdAt: Date.now(), version: 1 },
});

let data = emptyData();
let saveTimer = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadData() {
  try {
    ensureDir();
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      data = { ...emptyData(), ...parsed };
    }
  } catch (err) {
    console.error('[db] 讀取失敗，使用空白資料庫', err.message);
    data = emptyData();
  }
  return data;
}

export function persistNow() {
  try {
    ensureDir();
    const tmp = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.error('[db] 寫入失敗', err.message);
  }
}

export function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistNow();
  }, 400);
}

export function getData() {
  return data;
}

export const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;

export function hashPassword(password, salt = crypto.randomBytes(8).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(hash, 'hex'));
}

export function xpForLevel(level) {
  return Math.round(120 * Math.pow(level - 1, 1.6));
}

export function levelFromXp(xp) {
  let level = 1;
  while (xp >= xpForLevel(level + 1) && level < 99) level += 1;
  return level;
}

export const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  animation: 'normal',
  tableTheme: 'emerald',
  cardStyle: 'classic',
  language: 'zh-TW',
  notifications: true,
  privacy: 'friends',
  lowPerformance: false,
  autoMuck: false,
  fourColor: false,
};

export const DEFAULT_STATS = {
  handsPlayed: 0,
  handsWon: 0,
  showdowns: 0,
  showdownWins: 0,
  chipsWon: 0,
  chipsLost: 0,
  biggestPot: 0,
  allIns: 0,
  tournamentsPlayed: 0,
  tournamentsWon: 0,
  timePlayed: 0,
  handTypes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  streakBest: 0,
};

export function newUserRecord({ username, password, displayName, isGuest = false, avatar = 'a1' }) {
  const { salt, hash } = hashPassword(password || crypto.randomBytes(8).toString('hex'));
  const id = uid('u');
  return {
    id,
    username,
    salt,
    passHash: hash,
    displayName: displayName || username,
    avatar,
    bio: '一起在 Poker Club 享受德州撲克！',
    country: 'TW',
    isGuest,
    level: 1,
    xp: 0,
    chips: 20000,
    createdAt: Date.now(),
    lastSeen: Date.now(),
    settings: { ...DEFAULT_SETTINGS },
    stats: { ...DEFAULT_STATS, handTypes: new Array(10).fill(0) },
    achievements: [],
    titles: [],
    daily: { date: '', streak: 0, claimed: false, lastClaim: 0 },
    missions: { period: '', items: [] },
    clubId: null,
    online: false,
  };
}

export function getUser(id) {
  return data.users[id] || null;
}

export function findUserByName(username) {
  const lower = String(username || '').toLowerCase();
  return Object.values(data.users).find((u) => u.username.toLowerCase() === lower) || null;
}

export function createUser(record) {
  data.users[record.id] = record;
  persist();
  return record;
}

export function updateUser(id, patch) {
  const user = data.users[id];
  if (!user) return null;
  Object.assign(user, patch);
  persist();
  return user;
}

export function addXp(user, amount) {
  if (!user || !amount) return user;
  user.xp += Math.max(0, Math.round(amount));
  const newLevel = levelFromXp(user.xp);
  if (newLevel > user.level) {
    const gained = newLevel - user.level;
    user.level = newLevel;
    user.chips += gained * 500;
  }
  persist();
  return user;
}

export function bumpStats(user, patch) {
  if (!user) return null;
  user.stats = { ...DEFAULT_STATS, ...(user.stats || {}), ...patch };
  if (!Array.isArray(user.stats.handTypes) || user.stats.handTypes.length !== 10) {
    user.stats.handTypes = new Array(10).fill(0);
  }
  persist();
  return user;
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar,
    bio: user.bio,
    country: user.country,
    level: user.level,
    xp: user.xp,
    xpNext: xpForLevel(user.level + 1),
    xpCurrent: xpForLevel(user.level),
    chips: user.chips,
    isGuest: user.isGuest,
    createdAt: user.createdAt,
    stats: user.stats,
    settings: user.settings,
    achievements: user.achievements,
    titles: user.titles,
    daily: user.daily,
    clubId: user.clubId,
    online: !!user.online,
  };
}

// ---------- 工作階段 ----------
export function createSession(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  data.sessions[token] = { token, userId, createdAt: Date.now() };
  persist();
  return token;
}

export function sessionUser(token) {
  const session = data.sessions[token];
  if (!session) return null;
  return getUser(session.userId);
}

export function deleteSession(token) {
  delete data.sessions[token];
  persist();
}

// ---------- 牌局紀錄 ----------
export function recordHand(summary) {
  const record = {
    id: uid('h'),
    tableId: summary.tableId,
    tableName: summary.tableName,
    tournamentId: summary.tournamentId || null,
    handNo: summary.handNo,
    board: summary.board,
    pot: summary.pot,
    startedAt: summary.startedAt,
    endedAt: summary.endedAt,
    players: summary.players,
    winners: summary.winners,
  };
  data.hands.push(record);
  if (data.hands.length > 5000) data.hands = data.hands.slice(-5000);
  persist();
  return record;
}

export function userHands(userId, limit = 30) {
  return data.hands
    .filter((h) => h.players.some((p) => p.userId === userId))
    .slice(-limit)
    .reverse();
}

// ---------- 俱樂部 ----------
export function createClub(club) {
  data.clubs[club.id] = club;
  persist();
  return club;
}

export function getClub(id) {
  return data.clubs[id] || null;
}

export function listClubs() {
  return Object.values(data.clubs);
}

export function clubMembers(clubId) {
  return data.clubMembers.filter((m) => m.clubId === clubId);
}

export function membership(clubId, userId) {
  return data.clubMembers.find((m) => m.clubId === clubId && m.userId === userId) || null;
}

export function addMember(clubId, userId, role = 'member') {
  const existing = membership(clubId, userId);
  if (existing) return existing;
  const rec = { id: uid('cm'), clubId, userId, role, joinedAt: Date.now() };
  data.clubMembers.push(rec);
  const user = getUser(userId);
  if (user && !user.clubId) updateUser(userId, { clubId });
  persist();
  return rec;
}

export function removeMember(clubId, userId) {
  data.clubMembers = data.clubMembers.filter((m) => !(m.clubId === clubId && m.userId === userId));
  const user = getUser(userId);
  if (user && user.clubId === clubId) updateUser(userId, { clubId: null });
  persist();
}

export function setMemberRole(clubId, userId, role) {
  const rec = membership(clubId, userId);
  if (rec) {
    rec.role = role;
    persist();
  }
  return rec;
}

// ---------- 好友 ----------
export function friendshipsOf(userId) {
  return data.friendships.filter((f) => f.fromId === userId || f.toId === userId);
}

export function findFriendship(a, b) {
  return (
    data.friendships.find(
      (f) => (f.fromId === a && f.toId === b) || (f.fromId === b && f.toId === a),
    ) || null
  );
}

export function addFriendship(fromId, toId, status = 'pending') {
  const rec = { id: uid('f'), fromId, toId, status, createdAt: Date.now() };
  data.friendships.push(rec);
  persist();
  return rec;
}

export function updateFriendship(id, patch) {
  const rec = data.friendships.find((f) => f.id === id);
  if (rec) {
    Object.assign(rec, patch);
    persist();
  }
  return rec;
}

export function removeFriendship(id) {
  data.friendships = data.friendships.filter((f) => f.id !== id);
  persist();
}

// ---------- 房間 / 牌桌 ----------
export function createTableRecord(rec) {
  data.tables[rec.id] = rec;
  persist();
  return rec;
}

export function getTableRecord(id) {
  return data.tables[id] || null;
}

export function listTableRecords() {
  return Object.values(data.tables);
}

export function updateTableRecord(id, patch) {
  const rec = data.tables[id];
  if (!rec) return null;
  Object.assign(rec, patch);
  persist();
  return rec;
}

export function removeTableRecord(id) {
  delete data.tables[id];
  persist();
}

// ---------- 賽事 ----------
export function createTournamentRecord(rec) {
  data.tournaments[rec.id] = rec;
  persist();
  return rec;
}

export function getTournamentRecord(id) {
  return data.tournaments[id] || null;
}

export function listTournamentRecords() {
  return Object.values(data.tournaments);
}

export function updateTournamentRecord(id, patch) {
  const rec = data.tournaments[id];
  if (!rec) return null;
  Object.assign(rec, patch);
  persist();
  return rec;
}

export function tournamentEntries(tournamentId) {
  return data.entries.filter((e) => e.tournamentId === tournamentId);
}

export function addTournamentEntry(entry) {
  data.entries.push(entry);
  persist();
  return entry;
}

export function updateTournamentEntry(tournamentId, userId, patch) {
  const rec = data.entries.find((e) => e.tournamentId === tournamentId && e.userId === userId);
  if (rec) {
    Object.assign(rec, patch);
    persist();
  }
  return rec;
}

// ---------- 訊息 ----------
export function addMessage(msg) {
  const rec = { id: uid('m'), createdAt: Date.now(), ...msg };
  data.messages.push(rec);
  if (data.messages.length > 2000) data.messages = data.messages.slice(-2000);
  persist();
  return rec;
}

export function listMessages(scope, scopeId, limit = 50) {
  return data.messages.filter((m) => m.scope === scope && m.scopeId === scopeId).slice(-limit);
}

// ---------- 初始資料 ----------
export function seedIfNeeded() {
  if (Object.keys(data.tables).length === 0) {
    const seeds = [
      { id: 'pub-2-1', name: '雙人對決 · 銅牌', kind: 'public', maxPlayers: 2, smallBlind: 10, bigBlind: 20, minBuyIn: 400, maxBuyIn: 2000, hot: true },
      { id: 'pub-6-1', name: '綠絨桌 · 初級', kind: 'beginner', maxPlayers: 6, smallBlind: 10, bigBlind: 20, minBuyIn: 400, maxBuyIn: 2000, hot: true },
      { id: 'pub-6-2', name: '藍鑽桌 · 中級', kind: 'public', maxPlayers: 6, smallBlind: 50, bigBlind: 100, minBuyIn: 2000, maxBuyIn: 10000, hot: true },
      { id: 'pub-9-1', name: '金冠桌 · 高額', kind: 'public', maxPlayers: 9, smallBlind: 200, bigBlind: 400, minBuyIn: 8000, maxBuyIn: 40000, hot: false },
      { id: 'pub-6-3', name: '夜間俱樂部 · 6 人', kind: 'public', maxPlayers: 6, smallBlind: 25, bigBlind: 50, minBuyIn: 1000, maxBuyIn: 5000, hot: true },
      { id: 'pub-9-2', name: '新手練習場', kind: 'beginner', maxPlayers: 9, smallBlind: 5, bigBlind: 10, minBuyIn: 200, maxBuyIn: 1000, hot: false },
      { id: 'pub-2-2', name: '單挑擂台 · 高額', kind: 'public', maxPlayers: 2, smallBlind: 100, bigBlind: 200, minBuyIn: 4000, maxBuyIn: 20000, hot: false },
    ];
    for (const s of seeds) {
      data.tables[s.id] = {
        ...s,
        ownerId: null,
        clubId: null,
        password: null,
        code: null,
        createdAt: Date.now(),
        config: { bots: true, actionTimeoutMs: 20000 },
      };
    }
  }

  if (Object.keys(data.tournaments).length === 0) {
    const now = Date.now();
    const seeds = [
      { id: 'tour-daily', name: '每日免費賽', type: 'freezeout', maxPlayers: 18, startingStack: 3000, smallBlind: 15, bigBlind: 30, startAt: now + 1000 * 60 * 3, status: 'registering', blindLevelMs: 60000, prize: 20000, desc: '每晚免費開打，前三名可獲得積分獎勵。' },
      { id: 'tour-sng', name: '快速單桌賽', type: 'sng', maxPlayers: 6, startingStack: 2000, smallBlind: 10, bigBlind: 20, startAt: now + 1000 * 30, status: 'registering', blindLevelMs: 45000, prize: 8000, desc: '六人單桌，滿人即開賽，節奏明快。' },
      { id: 'tour-weekend', name: '週末金冠賽', type: 'mtt', maxPlayers: 27, startingStack: 5000, smallBlind: 25, bigBlind: 50, startAt: now + 1000 * 60 * 60 * 6, status: 'registering', blindLevelMs: 90000, prize: 60000, desc: '多桌錦標賽，冠軍獨得 30,000 積分。' },
      { id: 'tour-rookie', name: '新手友善賽', type: 'rookie', maxPlayers: 12, startingStack: 2500, smallBlind: 10, bigBlind: 20, startAt: now + 1000 * 60 * 15, status: 'registering', blindLevelMs: 60000, prize: 10000, desc: '專為新手設計，慢速盲注結構。' },
    ];
    for (const s of seeds) data.tournaments[s.id] = { ...s, createdAt: now, level: 0 };
  }

  if (Object.keys(data.clubs).length === 0) {
    const demo = {
      id: 'club-royal',
      name: '皇家撲克俱樂部',
      tag: 'ROYAL',
      logo: 'gold',
      description: '台北最活躍的免費撲克社群，每週固定舉辦俱樂部賽事。',
      announcement: '本週五 21:00 俱樂部內部錦標賽，冠軍可獲得限定稱號「皇家之王」。',
      joinMode: 'open',
      ownerId: 'system',
      createdAt: Date.now(),
      xp: 12400,
    };
    data.clubs[demo.id] = demo;
    const demo2 = {
      id: 'club-night',
      name: '夜貓撲克社',
      tag: 'NIGHT',
      logo: 'emerald',
      description: '深夜不打烊，24 小時都有牌桌。',
      announcement: '歡迎新成員加入，記得到俱樂部聊天室打聲招呼！',
      joinMode: 'open',
      ownerId: 'system',
      createdAt: Date.now(),
      xp: 8300,
    };
    data.clubs[demo2.id] = demo2;
  }
  persistNow();
}

loadData();
