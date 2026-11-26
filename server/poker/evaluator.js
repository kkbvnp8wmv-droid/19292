// 7 張牌最佳五張牌型判斷（德州撲克）
import { RANK_VALUE, SUIT_SYMBOLS } from './cards.js';

export const CAT_ROYAL = 9;
export const CAT_STRAIGHT_FLUSH = 8;
export const CAT_QUADS = 7;
export const CAT_FULL_HOUSE = 6;
export const CAT_FLUSH = 5;
export const CAT_STRAIGHT = 4;
export const CAT_TRIPS = 3;
export const CAT_TWO_PAIR = 2;
export const CAT_PAIR = 1;
export const CAT_HIGH = 0;

export const CAT_NAMES = [
  '高牌', '一對', '兩對', '三條', '順子', '同花', '三條帶對', '四條', '同花順', '皇家同花順',
];
export const CAT_NAMES_EN = [
  'High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush',
  'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush',
];

const RANK_ORDER = '23456789TJQKA';

function sortDesc(arr) {
  return arr.slice().sort((a, b) => b - a);
}

// 回傳順子的最高張（A 可作 1 用），無順子回傳 0
export function straigthHigh(uniqueDesc) {
  const set = new Set(uniqueDesc);
  if (set.has(14)) set.add(1);
  const vals = [...set].sort((a, b) => b - a);
  let run = 1;
  for (let i = 1; i < vals.length; i += 1) {
    if (vals[i] === vals[i - 1] - 1) {
      run += 1;
      if (run >= 5) return vals[i - 4];
    } else {
      run = 1;
    }
  }
  return 0;
}

function straigthRanks(high) {
  const out = [];
  for (let i = 0; i < 5; i += 1) {
    let v = high - i;
    if (v === 1) v = 14;
    out.push(v);
  }
  return out;
}

function cardsOfRank(cards, rank, limit) {
  const out = cards.filter((c) => RANK_VALUE[c[0]] === rank);
  return limit ? out.slice(0, limit) : out;
}

function pickBest(cards, ranks) {
  // 依傳入的 rank 順序挑出實際牌張（每個 rank 取一張，重複 rank 需求以 count 表示）
  const used = new Set();
  const out = [];
  for (const need of ranks) {
    const found = cards.find((c) => RANK_VALUE[c[0]] === need.rank && !used.has(c));
    if (found) {
      used.add(found);
      out.push(found);
    }
  }
  return out;
}

function encodeScore(cat, kickers) {
  const arr = [cat];
  for (let i = 0; i < 5; i += 1) arr.push(kickers[i] || 0);
  return arr.reduce((acc, v) => acc * 16 + v, 0);
}

/**
 * 評估 5~7 張牌，回傳最佳五張牌
 * @param {string[]} cards
 * @returns {{ category, name, nameEn, score, best, kickers }}
 */
export function evaluateHand(cards) {
  if (!Array.isArray(cards) || cards.length < 5) {
    throw new Error('需要至少 5 張牌才能評估');
  }
  const ranks = cards.map((c) => RANK_VALUE[c[0]]);
  const suets = cards.map((c) => c[1]);

  const countByRank = new Map();
  for (const r of ranks) countByRank.set(r, (countByRank.get(r) || 0) + 1);
  const rankCounts = [...countByRank.entries()]
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => (b.count - a.count) || (b.rank - a.rank));

  const countBySuet = new Map();
  for (const s of suets) countBySuet.set(s, (countBySuet.get(s) || 0) + 1);
  let flushSuet = null;
  for (const [s, n] of countBySuet.entries()) {
    if (n >= 5) flushSuet = s;
  }

  const uniqueDesc = sortDesc([...new Set(ranks)]);

  // 1. 同花順 / 皇家同花順
  if (flushSuet) {
    const flushCards = cards.filter((c) => c[1] === flushSuet);
    const flushRanks = sortDesc([...new Set(flushCards.map((c) => RANK_VALUE[c[0]]))]);
    const high = straigthHigh(flushRanks);
    if (high) {
      const wanted = straigthRanks(high);
      const best = wanted.map((r) => flushCards.find((c) => RANK_VALUE[c[0]] === r));
      const cat = high === 14 ? CAT_ROYAL : CAT_STRAIGHT_FLUSH;
      return {
        category: cat,
        name: CAT_NAMES[cat],
        nameEn: CAT_NAMES_EN[cat],
        score: encodeScore(cat, wanted),
        best: best.filter(Boolean),
        kickers: wanted,
        high,
      };
    }
  }

  // 2. 四條
  const quads = rankCounts.find((x) => x.count === 4);
  if (quads) {
    const kicker = rankCounts.find((x) => x.rank !== quads.rank);
    const kickers = [quads.rank, kicker ? kicker.rank : 0];
    return {
      category: CAT_QUADS,
      name: CAT_NAMES[CAT_QUADS],
      nameEn: CAT_NAMES_EN[CAT_QUADS],
      score: encodeScore(CAT_QUADS, kickers),
      best: cardsOfRank(cards, quads.rank).concat(cardsOfRank(cards, kicker.rank, 1)),
      kickers,
    };
  }

  // 3. 三條帶對（Full House）
  const trips = rankCounts.filter((x) => x.count >= 3);
  const pairs = rankCounts.filter((x) => x.count >= 2);
  if (trips.length >= 1) {
    const tripRank = tripps[0].rank;
    const pairCandidate = pairs.find((x) => x.rank !== tripRank);
    if (pairCandidate) {
      const kickers = [tripRank, pairCandidate.rank];
      return {
        category: CAT_FULL_HOUSE,
        name: CAT_NAMES[CAT_FULL_HOUSE],
        nameEn: CAT_NAMES_EN[CAT_FULL_HOUSE],
        score: encodeScore(CAT_FULL_HOUSE, kickers),
        best: cardsOfRank(cards, tripRank).concat(cardsOfRank(cards, pairCandidate.rank, 2)),
        kickers,
      };
    }
  }

  // 4. 同花
  if (flushSuet) {
    const flushCards = cards
      .filter((c) => c[1] === flushSuet)
      .sort((a, b) => RANK_VALUE[b[0]] - RANK_VALUE[a[0]])
      .slice(0, 5);
    const kickers = flushCards.map((c) => RANK_VALUE[c[0]]);
    return {
      category: CAT_FLUSH,
      name: CAT_NAMES[CAT_FLUSH],
      nameEn: CAT_NAMES_EN[CAT_FLUSH],
      score: encodeScore(CAT_FLUSH, kickers),
      best: flushCards,
      kickers,
    };
  }

  // 5. 順子
  const high = straigthHigh(uniqueDesc);
  if (high) {
    const wanted = straigthRanks(high);
    const best = [];
    const used = new Set();
    for (const r of wanted) {
      const found = cards.find((c) => RANK_VALUE[c[0]] === r && !used.has(c));
      if (found) {
        used.add(found);
        best.push(found);
      }
    }
    return {
      category: CAT_STRAIGHT,
      name: CAT_NAMES[CAT_STRAIGHT],
      nameEn: CAT_NAMES_EN[CAT_STRAIGHT],
      score: encodeScore(CAT_STRAIGHT, wanted),
      best,
      kickers: wanted,
      high,
    };
  }

  // 6. 三條
  if (trips.length >= 1) {
    const tripRank = tripps[0].rank;
    const kickers = [tripRank];
    for (const x of rankCounts) {
      if (x.rank !== tripRank && kickers.length < 3) kickers.push(x.rank);
    }
    const best = cardsOfRank(cards, tripRank);
    for (const r of kickers.slice(1)) best.push(...cardsOfRank(cards, r, 1));
    return {
      category: CAT_TRIPS,
      name: CAT_NAMES[CAT_TRIPS],
      nameEn: CAT_NAMES_EN[CAT_TRIPS],
      score: encodeScore(CAT_TRIPS, kickers),
      best,
      kickers,
    };
  }

  // 7. 兩對
  const pairList = rankCounts.filter((x) => x.count === 2);
  if (pairList.length >= 2) {
    const hiPair = pairList[0].rank;
    const loPair = pairList[1].rank;
    const kicker = rankCounts.find((x) => x.count === 1 && x.rank !== hiPair && x.rank !== loPair);
    const kickers = [hiPair, loPair, kicker ? kicker.rank : 0];
    const best = cardsOfRank(cards, hiPair).concat(cardsOfRank(cards, loPair));
    if (kicker) best.push(...cardsOfRank(cards, kicker.rank, 1));
    return {
      category: CAT_TWO_PAIR,
      name: CAT_NAMES[CAT_TWO_PAIR],
      nameEn: CAT_NAMES_EN[CAT_TWO_PAIR],
      score: encodeScore(CAT_TWO_PAIR, kickers),
      best,
      kickers,
    };
  }

  // 8. 一對
  if (pairList.length === 1) {
    const pairRank = pairList[0].rank;
    const kickers = [pairRank];
    for (const x of rankCounts) {
      if (x.rank !== pairRank && kickers.length < 4) kickers.push(x.rank);
    }
    const best = cardsOfRank(cards, pairRank);
    for (const r of kickers.slice(1)) best.push(...cardsOfRank(cards, r, 1));
    return {
      category: CAT_PAIR,
      name: CAT_NAMES[CAT_PAIR],
      nameEn: CAT_NAMES_EN[CAT_PAIR],
      score: encodeScore(CAT_PAIR, kickers),
      best,
      kickers,
    };
  }

  // 9. 高牌
  const kickers = uniqueDesc.slice(0, 5);
  const best = [];
  const used = new Set();
  for (const r of kickers) {
    const found = cards.find((c) => RANK_VALUE[c[0]] === r && !used.has(c));
    if (found) {
      used.add(found);
      best.push(found);
    }
  }
  return {
    category: CAT_HIGH,
    name: CAT_NAMES[CAT_HIGH],
    nameEn: CAT_NAMES_EN[CAT_HIGH],
    score: encodeScore(CAT_HIGH, kickers),
    best,
    kickers,
  };
}

export function describeHand(result) {
  if (!result) return '';
  const parts = [];
  for (const k of result.kickers) {
    if (k) parts.push(RANK_ORDER[k - 2] || '');
  }
  return result.name;
}

export function cardToText(card) {
  return card[0] + SUIT_SYMBOLS[card[1]];
}
