// 撲克規則引擎測試：牌型、下注輪、邊池、分池、平手
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHand, CAT_NAMES } from '../poker/evaluator.js';
import { PokerTable } from '../poker/table.js';
import { createDeck } from '../poker/cards.js';

const cat = (cards) => evaluateHand(cards).category;

test('牌型判斷：十種牌型', () => {
  assert.equal(cat(['As', 'Ks', 'Qs', 'Js', 'Ts', '2h', '3d']), 9); // 皇家同花順
  assert.equal(cat(['9s', '8s', '7s', '6s', '5s', '2h', '3d']), 8); // 同花順
  assert.equal(cat(['Ah', 'Ad', 'Ac', 'As', 'Ks', '2h', '3d']), 7); // 四條
  assert.equal(cat(['Kh', 'Kd', 'Kc', '9s', '9h', '2h', '3d']), 6); // 葫蘆
  assert.equal(cat(['Ah', 'Jh', '8h', '5h', '2h', '9s', '3d']), 5); // 同花
  assert.equal(cat(['9h', '8d', '7c', '6s', '5h', 'As', 'Kd']), 4); // 順子
  assert.equal(cat(['Qh', 'Qd', 'Qc', '9s', '5h', '2h', '3d']), 3); // 三條
  assert.equal(cat(['Jh', 'Jd', '4c', '4s', '9h', '2h', '3d']), 2); // 兩對
  assert.equal(cat(['Th', 'Td', '9c', '5s', '2h', '7h', '3d']), 1); // 一對
  assert.equal(cat(['Ah', 'Jd', '9c', '6s', '3h', '2d', '8c']), 0); // 高牌
});

test('A2345 視為五高順子，且小於 23456', () => {
  const wheel = evaluateHand(['Ah', '2d', '3c', '4s', '5h', '9d', 'Kc']);
  const six = evaluateHand(['2h', '3d', '4c', '5s', '6h', '9d', 'Kc']);
  assert.equal(wheel.category, 4);
  assert.equal(wheel.kickers[0], 5);
  assert.equal(six.category, 4);
  assert.ok(evaluateHand(['2h', '3d', '4c', '5s', '6h']).score > wheel.score);
});

test('同牌型比踢腳：兩對比較', () => {
  const a = evaluateHand(['Ah', 'Ad', 'Kc', 'Ks', '2h']);
  const b = evaluateHand(['As', 'Ac', 'Qd', 'Qh', 'Kh']);
  assert.equal(a.category, 2);
  assert.equal(b.category, 2);
  assert.ok(a.score > b.score);
});

test('牌型名稱可讀', () => {
  const result = evaluateHand(['As', 'Ks', 'Qs', 'Js', 'Ts', '2h', '3d']);
  assert.equal(CAT_NAMES[result.category], '皇家同花順');
  assert.equal(result.best.length, 5);
});

test('牌組為 52 張且不重複', () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck).size, 52);
});

function makeTable(maxPlayers = 3) {
  const events = [];
  const table = new PokerTable({
    id: 'test-table',
    name: '測試桌',
    maxPlayers,
    smallBlind: 5,
    bigBlind: 10,
    minBuyIn: 200,
    maxBuyIn: 2000,
    config: { bots: false, actionTimeoutMs: 600000, nextHandDelay: 600000 },
    hooks: { onEvent: (_t, ev) => events.push(ev) },
  });
  return { table, events };
}
test('發牌順序與盲注位置正確（3 人桌）', () => {
  const { table } = makeTable(3);
  table.seatPlayer({ userId: 'p1', name: 'P1', stack: 1000 });
  table.seatPlayer({ userId: 'p2', name: 'P2', stack: 1000 });
  table.seatPlayer({ userId: 'p3', name: 'P3', stack: 1000 });
  table.startHand();
  assert.equal(table.state, 'preflop');
  assert.equal(table.seats[table.sbIndex].committed, 5);
  assert.equal(table.seats[table.bbIndex].committed, 10);
  assert.equal(table.seats[table.buttonIndex].committed, 0);
  // 3 人桌：UTG 就是按鈕玩家
  assert.equal(table.actingIndex, table.buttonIndex);
  // 每人兩張底牌
  for (const s of table.occupiedSeats()) assert.equal(s.cards.length, 2);
  assert.equal(new Set(table.occupiedSeats().flatMap((s) => s.cards)).size, 6);
});

test('跟注、過牌推進到下一個街區並發公共牌', () => {
  const { table } = makeTable(3);
  table.seatPlayer({ userId: 'p1', name: 'P1', stack: 1000 });
  table.seatPlayer({ userId: 'p2', name: 'P2', stack: 1000 });
  table.seatPlayer({ userId: 'p3', name: 'P3', stack: 1000 });
  table.startHand();
  let guard = 0;
  while (table.state === 'preflop' && guard < 10) {
    guard += 1;
    const seat = table.seats[table.actingIndex];
    const actions = table.actionsFor(seat);
    table.act(seat.seat, actions.canCheck ? 'check' : 'call');
  }
  assert.equal(table.state, 'flop');
  assert.equal(table.board.length, 3);
  assert.equal(table.pot, 30);
});

test('棄牌後剩餘玩家直接贏得底池', () => {
  const { table } = makeTable(2);
  table.seatPlayer({ userId: 'p1', name: 'P1', stack: 1000 });
  table.seatPlayer({ userId: 'p2', name: 'P2', stack: 1000 });
  table.startHand();
  const first = table.seats[table.actingIndex];
  table.act(first.seat, 'fold');
  assert.equal(table.state, 'showdown');
  const other = table.occupiedSeats().find((s) => s.userId !== first.userId);
  assert.equal(other.stack, 1005); // 1000 - 10 + 15（BB 投入 10，贏回 15）
});

test('All-in 邊池分配正確（三方不同籌碼）', () => {
  const { table } = makeTable(3);
  table.seatPlayer({ userId: 'short', name: 'Short', stack: 100 });
  table.seatPlayer({ userId: 'mid', name: 'Mid', stack: 300 });
  table.seatPlayer({ userId: 'big', name: 'Big', stack: 600 });
  table.startHand();

  // 全部 All-in
  let guard = 0;
  while (['preflop', 'flop', 'turn', 'river'].includes(table.state) && guard < 20) {
    guard += 1;
    const seat = table.seats[table.actingIndex];
    if (!seat) break;
    table.act(seat.seat, 'allin');
  }
  assert.equal(table.state, 'showdown');
  const results = table.results;
  assert.ok(results, '應有攤牌結果');
  const totalAwarded = results.winners.reduce((a, w) => a + w.amount, 0);
  assert.equal(totalAwarded, table.pot, '所有底池必須完全分配');
  const totalStacks = table.occupiedSeats().reduce((a, s) => a + s.stack, 0);
  assert.equal(totalStacks, 1000, '籌碼守恆');
  // 邊池數量：不同籌碼層級應產生多個底池
  assert.ok(results.pots.length >= 2, '應有多個邊池');
});

test('平手時底池平均分配', () => {
  const { table } = makeTable(2);
  table.seatPlayer({ userId: 'a', name: 'A', stack: 500 });
  table.seatPlayer({ userId: 'b', name: 'B', stack: 500 });
  table.startHand();
  // 強制公共牌為同一副牌（雙方最佳牌型相同）
  table.board = ['As', 'Ks', 'Qs', 'Js', 'Ts'];
  table.seats.forEach((s) => {
    if (s) {
      s.cards = ['2h', '3d'];
      s.committed = 50;
      s.bet = 0;
      s.folded = false;
      s.allIn = false;
    }
  });
  table.syncPot();
  assert.equal(table.pot, 100);
  table.showdown();
  const winners = table.results.winners;
  assert.equal(winners.length, 2, '兩位玩家都應獲勝');
  assert.equal(winners[0].amount + winners[1].amount, 100);
  assert.equal(table.occupiedSeats().reduce((a, s) => a + s.stack, 0), 1100);
});

test('加注需符合最小加注額', () => {
  const { table } = makeTable(3);
  table.seatPlayer({ userId: 'p1', name: 'P1', stack: 1000 });
  table.seatPlayer({ userId: 'p2', name: 'P2', stack: 1000 });
  table.seatPlayer({ userId: 'p3', name: 'P3', stack: 1000 });
  table.startHand();
  const seat = table.seats[table.actingIndex];
  const actions = table.actionsFor(seat);
  assert.equal(actions.minRaiseTo, 20); // 10 + 10
  const bad = table.act(seat.seat, 'raise', 12);
  assert.equal(bad.ok, false);
  const good = table.act(seat.seat, 'raise', 30);
  assert.equal(good.ok, true);
  assert.equal(table.currentBet, 30);
});
