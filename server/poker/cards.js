// 牌組工具：標準 52 張撲克牌
// 牌以字串表示，例如 "As" = 黑桃 A、"Td" = 方塊 10

export const RANK_CHARS = '23456789TJQKA';
export const SUITS = ['s', 'h', 'd', 'c'];

export const RANK_VALUE = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

export const SUIT_SYMBOLS = { s: '\u2660', h: '\u2665', d: '\u2666', c: '\u2663' };
export const SUIT_COLORS = { s: 'black', h: 'red', d: 'red', c: 'black' };

export function createDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (const r of RANK_CHARS) deck.push(r + s);
  }
  return deck;
}

export function shufle(deck, rng = Math.random) {
  const arr = deck.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export function rankOf(card) {
  return RANK_VALUE[card[0]];
}

export function suitOf(card) {
  return card[1];
}

export function cardLabel(card) {
  if (!card) return '';
  return card[0] + SUIT_SYMBOLS[card[1]];
}
