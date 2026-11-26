// 電腦玩家決策（讓單人也能完整體驗多人牌桌）
import { RANK_VALUE } from './cards.js';
import { evaluateHand } from './evaluator.js';

function preflopScore(cards) {
  const vals = cards.map((c) => RANK_VALUE[c[0]]).sort((a, b) => b - a);
  const [hi, lo] = vals;
  const suited = cards[0][1] === cards[1][1];
  const gap = hi - lo;
  let score = hi * 1.6 + lo * 1.1;
  if (hi === lo) score += 26 + hi * 1.4;
  if (suited) score += 4;
  if (gap === 1) score += 5;
  else if (gap === 2) score += 2;
  else if (gap >= 5) score -= 3;
  if (hi >= 13 && lo >= 10) score += 6;
  return score; // 約 6 ~ 75
}

function postflopStrength(table, seat) {
  const cards = [...table.board, ...seat.cards];
  if (cards.length < 5) return { score: 0, category: 0 };
  const ev = evaluateHand(cards);
  return { score: ev.score, category: ev.category, name: ev.name };
}

export function decideBotAction(table, seat) {
  const toCall = Math.max(0, table.currentBet - seat.bet);
  const pot = Math.max(table.totalPot(), table.bigBlind);
  const maxTarget = seat.bet + seat.stack;
  const minTarget = Math.min(table.currentBet + table.minRaise, maxTarget);
  const rand = Math.random();
  const aggressive = 0.35 + Math.random() * 0.3;

  const raiseTo = (mult) => {
    const target = Math.min(Math.max(Math.round((table.currentBet + pot * mult) / table.bigBlind) * table.bigBlind, minTarget), maxTarget);
    return target;
  };

  if (table.state === 'preflop') {
    const score = preflopScore(seat.cards);
    const cheap = toCall <= table.bigBlind * 2;
    if (score > 55) {
      if (rand < 0.65 && maxTarget > table.currentBet) return { action: 'raise', amount: raiseTo(0.9) };
      return { action: toCall > 0 ? 'call' : 'check' };
    }
    if (score > 38) {
      if (rand < aggressive && maxTarget > table.currentBet) return { action: 'raise', amount: raiseTo(0.55) };
      if (cheap || toCall === 0) return { action: toCall > 0 ? 'call' : 'check' };
      return { action: 'fold' };
    }
    if (score > 26) {
      if (toCall === 0) return { action: 'check' };
      if (cheap && rand < 0.6) return { action: 'call' };
      return { action: 'fold' };
    }
    if (toCall === 0) return { action: 'check' };
    return { action: 'fold' };
  }

  const strength = postflopStrength(table, seat);
  const cat = strength.category;
  const potOdds = toCall / (pot + toCall + 1);
  const strong = cat >= 3;
  const good = cat === 2;
  const drawish = cat === 1 && rand < 0.4;

  if (strong) {
    if (rand < 0.7 && maxTarget > table.currentBet) return { action: 'raise', amount: raiseTo(0.75) };
    return { action: toCall > 0 ? 'call' : 'check' };
  }
  if (good) {
    if (rand < 0.45 && maxTarget > table.currentBet) return { action: 'raise', amount: raiseTo(0.45) };
    if (toCall === 0) return { action: 'check' };
    if (potOdds < 0.45 || toCall < seat.stack * 0.2) return { action: 'call' };
    return { action: 'fold' };
  }
  if (drawish) {
    if (toCall === 0) return rand < 0.3 && maxTarget > table.currentBet ? { action: 'raise', amount: raiseTo(0.35) } : { action: 'check' };
    if (potOdds < 0.3) return { action: 'call' };
    return { action: 'fold' };
  }
  if (toCall === 0) {
    if (rand < 0.18 && maxTarget > table.currentBet) return { action: 'raise', amount: raiseTo(0.4) };
    return { action: 'check' };
  }
  if (toCall < pot * 0.12 && rand < 0.35) return { action: 'call' };
  return { action: 'fold' };
}

export const BOT_PROFILES = [
  { name: '金手套', avatar: 'a3' },
  { name: 'All-in 阿明', avatar: 'a7' },
  { name: '冷靜的貓', avatar: 'a5' },
  { name: 'River 女王', avatar: 'a9' },
  { name: '幸運星', avatar: 'a2' },
  { name: '老手阿德', avatar: 'a11' },
  { name: '小盲注', avatar: 'a4' },
  { name: '撲克熊', avatar: 'a8' },
  { name: '夜貓子', avatar: 'a6' },
  { name: '賭神接班人', avatar: 'a10' },
  { name: '優雅的狼', avatar: 'a12' },
  { name: '青銅玩家', avatar: 'a1' },
];
