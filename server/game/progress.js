// 任務、成就、每日獎勵與玩家進度
import { getUser, updateUser, addXp, persist, publicUser } from '../db.js';

export const DAILY_MISSIONS = [
  { id: 'play5', title: '完成 5 手牌', desc: '在任一牌桌完成 5 手牌', target: 5, chips: 400, xp: 60, icon: 'cards' },
  { id: 'win2', title: '贏得 2 手牌', desc: '贏得 2 次底池', target: 2, chips: 500, xp: 80, icon: 'trophy' },
  { id: 'allin1', title: '全下一次', desc: 'All-in 1 次', target: 1, chips: 300, xp: 40, icon: 'flame' },
  { id: 'showdown1', title: '攤牌對決', desc: '參與 1 次攤牌', target: 1, chips: 350, xp: 50, icon: 'eye' },
];

export const WEEKLY_MISSIONS = [
  { id: 'w_play40', title: '本週完成 40 手牌', desc: '累積 40 手牌', target: 40, chips: 2500, xp: 400, icon: 'cards' },
  { id: 'w_win15', title: '本週贏得 15 手牌', desc: '累積 15 次勝利', target: 15, chips: 3000, xp: 500, icon: 'trophy' },
  { id: 'w_tour1', title: '參加 1 場錦標賽', desc: '報名並完成 1 場賽事', target: 1, chips: 2000, xp: 300, icon: 'medal' },
];

export const ACHIEVEMENTS = [
  { id: 'first_hand', title: '初次上桌', desc: '完成第一手牌', icon: 'cards', chips: 500, xp: 50 },
  { id: 'first_win', title: '首勝', desc: '贏得第一個底池', icon: 'trophy', chips: 800, xp: 80 },
  { id: 'hands_50', title: '牌桌常客', desc: '累積 50 手牌', icon: 'cards', chips: 1500, xp: 150 },
  { id: 'hands_200', title: '老手', desc: '累積 200 手牌', icon: 'cards', chips: 5000, xp: 500 },
  { id: 'wins_25', title: '連勝高手', desc: '贏得 25 手牌', icon: 'trophy', chips: 3000, xp: 300 },
  { id: 'royal_flush', title: '皇家同花順', desc: '組成一次皇家同花順', icon: 'crown', chips: 10000, xp: 1000 },
  { id: 'straight_flush', title: '同花順', desc: '組成一次同花順', icon: 'crown', chips: 5000, xp: 500 },
  { id: 'quads', title: '四條', desc: '組成一次四條', icon: 'diamond', chips: 3000, xp: 300 },
  { id: 'big_pot', title: '大底池', desc: '單局贏得 10,000 積分', icon: 'chip', chips: 4000, xp: 400 },
  { id: 'level_5', title: '等級 5', desc: '達到等級 5', icon: 'star', chips: 2000, xp: 200 },
  { id: 'club_member', title: '俱樂部成員', desc: '加入一個俱樂部', icon: 'club', chips: 1000, xp: 100 },
  { id: 'tour_win', title: '錦標賽冠軍', desc: '贏得 1 場錦標賽', icon: 'medal', chips: 8000, xp: 800 },
];

const todayKey = () => new Date().toISOString().slice(0, 10);
const weekKey = () => {
  const d = new Date();
  const first = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - first) / 86400000 + first.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
};

export function ensureMissions(user) {
  const period = `${todayKey()}|${weekKey()}`;
  if (!user.missions || user.missions.period !== period) {
    user.missions = {
      period,
      items: [
        ...DAILY_MISSIONS.map((m) => ({ id: m.id, scope: 'daily', progress: 0, claimed: false })),
        ...WEEKLY_MISSIONS.map((m) => ({ id: m.id, scope: 'weekly', progress: 0, claimed: false })),
      ],
    };
    persist();
  }
  return user.missions;
}

export function missionDefs() {
  return { daily: DAILY_MISSIONS, weekly: WEEKLY_MISSIONS };
}

export function missionsView(user) {
  const missions = ensureMissions(user);
  const defs = [...DAILY_MISSIONS, ...WEEKLY_MISSIONS];
  return missions.items.map((item) => {
    const def = defs.find((d) => d.id === item.id);
    return {
      ...item,
      title: def.title,
      desc: def.desc,
      target: def.target,
      chips: def.chips,
      xp: def.xp,
      icon: def.icon,
      done: item.progress >= def.target,
    };
  });
}

export function progressMission(user, id, amount = 1) {
  const missions = ensureMissions(user);
  const item = missions.items.find((m) => m.id === id);
  if (!item) return;
  const defs = [...DAILY_MISSIONS, ...WEEKLY_MISSIONS];
  const def = defs.find((d) => d.id === id);
  item.progress = Math.min(def.target, item.progress + amount);
  persist();
}

export function claimMission(user, id) {
  const missions = ensureMissions(user);
  const item = missions.items.find((m) => m.id === id);
  if (!item) return { ok: false, error: '找不到任務' };
  const defs = [...DAILY_MISSIONS, ...WEEKLY_MISSIONS];
  const def = defs.find((d) => d.id === id);
  if (item.claimed) return { ok: false, error: '獎勵已領取' };
  if (item.progress < def.target) return { ok: false, error: '任務尚未完成' };
  item.claimed = true;
  user.chips += def.chips;
  addXp(user, def.xp);
  persist();
  return { ok: true, chips: def.chips, xp: def.xp };
}

export function dailyReward(user) {
  const today = todayKey();
  const daily = user.daily || { date: '', streak: 0, claimed: false, lastClaim: 0 };
  if (daily.date === today && daily.claimed) {
    return { ok: false, error: '今天已經領取過了', daily };
  }
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const streak = daily.date === yesterday ? Math.min((daily.streak || 0) + 1, 7) : 1;
  const reward = 1000 + (streak - 1) * 400;
  user.daily = { date: today, streak, claimed: true, lastClaim: Date.now() };
  user.chips += reward;
  addXp(user, 100 + streak * 20);
  persist();
  return { ok: true, reward, streak, chips: reward, xp: 100 + streak * 20 };
}

export function checkAchievements(user, extra = {}) {
  const unlocked = [];
  const have = new Set(user.achievements || []);
  const stats = user.stats || {};
  const test = {
    first_hand: stats.handsPlayed >= 1,
    first_win: stats.handsWon >= 1,
    hands_50: stats.handsPlayed >= 50,
    hands_200: stats.handsPlayed >= 200,
    wins_25: stats.handsWon >= 25,
    royal_flush: (stats.handTypes?.[9] || 0) >= 1,
    straight_flush: (stats.handTypes?.[8] || 0) >= 1,
    quads: (stats.handTypes?.[7] || 0) >= 1,
    big_pot: (stats.biggestPot || 0) >= 10000,
    level_5: user.level >= 5,
    club_member: !!user.clubId,
    tour_win: (stats.tournamentsWon || 0) >= 1,
    ...extra,
  };
  for (const ach of ACHIEVEMENTS) {
    if (test[ach.id] && !have.has(ach.id)) {
      have.add(ach.id);
      user.chips += ach.chips;
      addXp(user, ach.xp);
      unlocked.push(ach);
    }
  }
  if (unlocked.length) {
    user.achievements = [...have];
    persist();
  }
  return unlocked;
}

export function achievementsView(user) {
  const have = new Set(user.achievements || []);
  return ACHIEVEMENTS.map((a) => ({ ...a, unlocked: have.has(a.id) }));
}

export function statsView(user) {
  const stats = user.stats || {};
  return {
    ...stats,
    winRate: stats.handsPlayed ? Math.round((stats.handsWon / stats.handsPlayed) * 100) : 0,
    user: publicUser(user),
  };
}

export function rankTitle(level) {
  if (level >= 40) return '傳奇';
  if (level >= 25) return '大師';
  if (level >= 15) return '鑽石';
  if (level >= 10) return '白金';
  if (level >= 5) return '黃金';
  if (level >= 3) return '白銀';
  return '青銅';
}

export function touchUser(user) {
  if (!user) return;
  updateUser(user.id, { lastSeen: Date.now() });
}
