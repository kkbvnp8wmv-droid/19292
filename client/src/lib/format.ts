// 格式化與牌面工具
export const RANK_LABEL: Record<string, string> = {
  A: 'A',
  K: 'K',
  Q: 'Q',
  J: 'J',
  T: '10',
  '9': '9',
  '8': '8',
  '7': '7',
  '6': '6',
  '5': '5',
  '4': '4',
  '3': '3',
  '2': '2',
};

export const SUIT_SYMBOL: Record<string, string> = {
  s: '♠',
  h: '♥',
  d: '♦',
  c: '♣',
};

export function fmt(n: number | null | undefined): string {
  const v = Math.round(Number(n) || 0);
  if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (Math.abs(v) >= 10000) return `${(v / 1000).toFixed(1)}K`;
  return v.toLocaleString('en-US');
}

export function fmtFull(n: number | null | undefined): string {
  return Math.round(Number(n) || 0).toLocaleString('en-US');
}

export function timeAgo(ts: number | null | undefined): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return '剛剛';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分鐘前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小時前`;
  return `${Math.floor(diff / 86400000)} 天前`;
}

export function clockText(ts: number | null | undefined): string {
  if (!ts) return '--:--';
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function dateText(ts: number | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
}

export function durationText(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} 小時 ${m} 分`;
  return `${m} 分`;
}

export function cardParts(card: string): { rank: string; suit: string; red: boolean; hidden: boolean } {
  if (!card || card === 'back' || card.length < 2) {
    return { rank: '', suit: '', red: false, hidden: true };
  }
  const rank = RANK_LABEL[card[0]] || card[0];
  const suit = card[1];
  return { rank, suit: SUIT_SYMBOL[suit] || suit, red: suit === 'h' || suit === 'd', hidden: false };
}

export const ACTION_LABEL: Record<string, string> = {
  fold: '棄牌',
  check: '過牌',
  call: '跟注',
  bet: '下注',
  raise: '加注',
  allin: 'All-in',
  smallBlind: '小盲',
  bigBlind: '大盲',
  sitOut: '暫離',
};

export const STATE_LABEL: Record<string, string> = {
  waiting: '等待玩家',
  preflop: '翻牌前',
  flop: '翻牌圈',
  turn: '轉牌圈',
  river: '河牌圈',
  showdown: '攤牌',
  finished: '已結束',
};

export const EMOTES = ['😀', '😎', '🔥', '👏', '😱', '🤝', '🍀', '💪', '😭', '🃏', '💰', '🎯'];

export function pct(value: number, total: number): number {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

export function initials(name: string | null | undefined): string {
  const n = (name || '?').trim();
  return n.slice(0, 1).toUpperCase();
}
