// 德州撲克牌桌引擎（無網路相依，可獨立測試）
import { createDeck, shufle, RANK_VALUE } from './cards.js';
import { evaluateHand } from './evaluator.js';
import { decideBotAction } from './bots.js';

const STREET_NEXT = { preflop: 'flop', flop: 'turn', turn: 'river', river: 'showdown' };

export class PokerTable {
  constructor(opts = {}) {
    this.id = opts.id || 'table';
    this.name = opts.name || 'Poker Club 牌桌';
    this.kind = opts.kind || 'public'; // public | beginner | private | club | tournament
    this.clubId = opts.clubId || null;
    this.ownerId = opts.ownerId || null;
    this.code = opts.code || null;
    this.maxPlayers = opts.maxPlayers || 6;
    this.smallBlind = opts.smallBlind || 10;
    this.bigBlind = opts.bigBlind || 20;
    this.minBuyIn = opts.minBuyIn || this.bigBlind * 20;
    this.maxBuyIn = opts.maxBuyIn || this.bigBlind * 200;
    this.config = opts.config || {};
    this.hooks = opts.hooks || {};
    this.actionTimeoutMs = this.config.actionTimeoutMs || 20000;
    this.nextHandDelay = this.config.nextHandDelay || 4200;
    this.tournamentId = opts.tournamentId || null;

    this.seats = new Array(this.maxPlayers).fill(null);
    this.state = 'waiting';
    this.handNo = 0;
    this.board = [];
    this.deck = [];
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.buttonIndex = -1;
    this.sbIndex = -1;
    this.bbIndex = -1;
    this.actingIndex = -1;
    this.actionEndsAt = 0;
    this.participants = [];
    this.results = null;
    this.winners = [];
    this.log = [];
    this.timer = null;
    this.botTimer = null;
    this.nextHandTimer = null;
    this.createdAt = Date.now();
    this.handStartedAt = 0;
    this.lastActionAt = Date.now();
    this.stats = { hands: 0, biggestPot: 0 };
  }

  // ---------- 基礎工具 ----------
  totalPot() {
    return this.seats.reduce((sum, s) => sum + (s ? s.committed : 0), 0);
  }

  syncPot() {
    this.pot = this.totalPot();
  }

  emit(event) {
    if (this.hooks.onEvent) this.hooks.onEvent(this, event);
  }

  broadcast() {
    if (this.hooks.onUpdate) this.hooks.onUpdate(this);
  }

  addLog(text) {
    this.log.push({ text, ts: Date.now() });
    if (this.log.length > 60) this.log.shift();
  }

  nextSeatIn(list, from) {
    if (!list.length) return -1;
    const sorted = list.slice().sort((a, b) => a - b);
    const next = sorted.find((i) => i > from);
    return next === undefined ? sorted[0] : next;
  }

  rotateFrom(from, list) {
    const sorted = list.slice().sort((a, b) => a - b);
    const idx = sorted.findIndex((i) => i > from);
    if (idx === -1) return sorted;
    return sorted.slice(idx).concat(sorted.slice(0, idx));
  }

  seatOf(userId) {
    return this.seats.find((s) => s && s.userId === userId) || null;
  }

  occupiedSeats() {
    return this.seats.filter(Boolean);
  }

  inHand() {
    return this.seats.filter((s) => s && !s.folded && s.cards.length === 2);
  }

  readySeats() {
    return this.seats.filter((s) => s && s.stack > 0 && !s.sittingOut);
  }

  findOpenSeat() {
    const start = this.buttonIndex < 0 ? 0 : this.buttonIndex;
    for (let i = 1; i <= this.maxPlayers; i += 1) {
      const idx = (start + i) % this.maxPlayers;
      if (!this.seats[idx]) return idx;
    }
    return -1;
  }

  // ---------- 玩家加入 / 離開 ----------
  seatPlayer(player) {
    const existing = this.seatOf(player.userId);
    if (existing) {
      existing.connected = true;
      if (player.socketId) existing.socketId = player.socketId;
      if (player.name) existing.name = player.name;
      if (player.avatar) existing.avatar = player.avatar;
      this.broadcast();
      return existing;
    }
    const idx = this.findOpenSeat();
    if (idx < 0) return null;
    const seat = {
      seat: idx,
      userId: player.userId,
      name: player.name || '玩家',
      avatar: player.avatar || 'a1',
      level: player.level || 1,
      stack: Math.floor(player.stack || this.minBuyIn),
      bet: 0,
      committed: 0,
      folded: true,
      allIn: false,
      cards: [],
      acted: false,
      connected: player.connected !== false,
      isBot: !!player.isBot,
      socketId: player.socketId || null,
      lastAction: null,
      sittingOut: false,
      showCards: false,
      winAmount: 0,
      handName: null,
      winCount: 0,
      joinedAt: Date.now(),
    };
    this.seats[idx] = seat;
    this.addLog(`${seat.name} 加入牌桌`);
    this.emit({ type: 'sit', seat: idx, name: seat.name });
    if (this.state === 'waiting' || this.state === 'showdown') this.scheduleStart(1200);
    this.broadcast();
    return seat;
  }

  removePlayer(userId) {
    const seat = this.seatOf(userId);
    if (!seat) return null;
    this.seats[seat.seat] = null;
    this.addLog(`${seat.name} 離開牌桌`);
    this.emit({ type: 'leave', seat: seat.seat });
    if (this.state !== 'waiting' && this.state !== 'showdown') {
      if (seat.seat === this.actingIndex) {
        seat.folded = true;
        this.actingIndex = -1;
        this.advanceTurn();
      }
    }
    this.broadcast();
    return seat;
  }

  setConnected(userId, connected) {
    const seat = this.seatOf(userId);
    if (!seat) return;
    seat.connected = connected;
    if (!connected && this.actingIndex === seat.seat) {
      this.clearTurnTimer();
      this.timer = setTimeout(() => {
        if (this.actingIndex === seat.seat) this.autoAct(seat);
      }, 1500);
    }
    this.broadcast();
  }

  // ---------- 開局 ----------
  scheduleStart(delay = 1200) {
    if (this.nextHandTimer) return;
    this.nextHandTimer = setTimeout(() => {
      this.nextHandTimer = null;
      this.startHand();
    }, delay);
  }

  startHand() {
    if (this.state !== 'waiting' && this.state !== 'showdown') return false;
    const ready = this.readySeats();
    if (ready.length < 2) {
      this.state = 'waiting';
      this.actingIndex = -1;
      this.broadcast();
      return false;
    }
    this.clearTimers();
    this.handNo += 1;
    this.stats.hands += 1;
    this.deck = shufle(createDeck());
    this.board = [];
    this.results = null;
    this.winners = [];
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.log = [];
    for (const s of this.seats) {
      if (!s) continue;
      s.bet = 0;
      s.committed = 0;
      s.folded = true;
      s.allIn = false;
      s.cards = [];
      s.acted = false;
      s.lastAction = null;
      s.showCards = false;
      s.winAmount = 0;
      s.handName = null;
      if (s.stack <= 0) s.sittingOut = true;
    }

    this.participants = ready.map((s) => s.seat);
    this.buttonIndex = this.nextSeatIn(this.participants, this.buttonIndex);
    if (this.participants.length === 2) {
      this.sbIndex = this.buttonIndex;
      this.bbIndex = this.nextSeatIn(this.participants, this.buttonIndex);
    } else {
      this.sbIndex = this.nextSeatIn(this.participants, this.buttonIndex);
      this.bbIndex = this.nextSeatIn(this.participants, this.sbIndex);
    }

    for (const idx of this.participants) {
      const s = this.seats[idx];
      s.folded = false;
      s.acted = false;
    }

    this.postBlind(this.seats[this.sbIndex], this.smallBlind, 'sb');
    this.postBlind(this.seats[this.bbIndex], this.bigBlind, 'bb');
    this.currentBet = Math.max(...this.participants.map((i) => this.seats[i].bet), this.bigBlind);
    this.minRaise = this.bigBlind;

    // 發底牌：從按鈕左側開始，一人一張
    const order = this.rotateFrom(this.buttonIndex, this.participants);
    for (let round = 0; round < 2; round += 1) {
      for (const idx of order) {
        const s = this.seats[idx];
        if (s) s.cards.push(this.deck.pop());
      }
    }

    this.state = 'preflop';
    this.handStartedAt = Date.now();
    this.syncPot();
    this.addLog(`第 ${this.handNo} 手牌開始（盲注 ${this.smallBlind}/${this.bigBlind}）`);
    this.emit({
      type: 'handStart',
      handNo: this.handNo,
      button: this.buttonIndex,
      sb: this.sbIndex,
      bb: this.bbIndex,
    });
    this.actingIndex = this.nextToActAfter(this.bbIndex);
    this.beginTurn();
    this.broadcast();
    return true;
  }

  postBlind(seat, amount, kind) {
    if (!seat) return;
    const pay = Math.min(amount, seat.stack);
    seat.stack -= pay;
    seat.bet += pay;
    seat.committed += pay;
    seat.lastAction = kind === 'sb' ? 'small blind' : 'big blind';
    if (seat.stack === 0) seat.allIn = true;
  }

  nextToActAfter(from) {
    for (let i = 1; i <= this.maxPlayers; i += 1) {
      const idx = (from + i) % this.maxPlayers;
      const s = this.seats[idx];
      if (s && !s.folded && !s.allIn && s.cards.length === 2) return idx;
    }
    return -1;
  }

  beginTurn() {
    this.clearTurnTimer();
    if (this.actingIndex < 0) {
      this.endStreet();
      return;
    }
    const seat = this.seats[this.actingIndex];
    if (!seat || seat.folded || seat.allIn) {
      this.advanceTurn();
      return;
    }
    this.actionEndsAt = Date.now() + this.actionTimeoutMs;
    this.lastActionAt = Date.now();
    if (seat.isBot) {
      const think = 700 + Math.floor(Math.random() * 1200);
      this.botTimer = setTimeout(() => {
        if (this.actingIndex !== seat.seat) return;
        const move = decideBotAction(this, seat);
        this.act(seat.seat, move.action, move.amount);
      }, think);
    } else {
      this.timer = setTimeout(() => {
        if (this.actingIndex === seat.seat) this.autoAct(seat);
      }, this.actionTimeoutMs + 250);
    }
    this.broadcast();
  }

  clearTurnTimer() {
    if (this.timer) clearTimeout(this.timer);
    if (this.botTimer) clearTimeout(this.botTimer);
    this.timer = null;
    this.botTimer = null;
  }

  clearTimers() {
    this.clearTurnTimer();
    if (this.nextHandTimer) clearTimeout(this.nextHandTimer);
    this.nextHandTimer = null;
  }

  autoAct(seat) {
    if (!seat || this.actingIndex !== seat.seat) return;
    if (seat.bet >= this.currentBet) this.act(seat.seat, 'check');
    else this.act(seat.seat, 'fold');
  }

  // ---------- 玩家行動 ----------
  act(seatIndex, action, amount) {
    const seat = this.seats[seatIndex];
    if (!seat) return { ok: false, error: '找不到座位' };
    if (this.actingIndex !== seatIndex) return { ok: false, error: '還沒輪到你行動' };
    if (seat.folded || seat.allIn) return { ok: false, error: '無法行動' };
    if (!['preflop', 'flop', 'turn', 'river'].includes(this.state)) {
      return { ok: false, error: '目前無法下注' };
    }
    const toCall = Math.max(0, this.currentBet - seat.bet);
    let applied = action;

    if (action === 'fold') {
      seat.folded = true;
      seat.acted = true;
      seat.lastAction = 'fold';
      this.addLog(`${seat.name} 棄牌`);
      this.emit({ type: 'action', seat: seatIndex, action: 'fold' });
    } else if (action === 'check') {
      if (toCall > 0) return { ok: false, error: '需要跟注或棄牌' };
      seat.acted = true;
      seat.lastAction = 'check';
      this.addLog(`${seat.name} 過牌`);
      this.emit({ type: 'action', seat: seatIndex, action: 'check' });
    } else if (action === 'call') {
      if (toCall === 0) {
        seat.acted = true;
        seat.lastAction = 'check';
        this.emit({ type: 'action', seat: seatIndex, action: 'check' });
      } else {
        const pay = Math.min(toCall, seat.stack);
        seat.stack -= pay;
        seat.bet += pay;
        seat.committed += pay;
        seat.acted = true;
        if (seat.stack === 0) {
          seat.allIn = true;
          seat.lastAction = 'all in';
          applied = 'allin';
          this.addLog(`${seat.name} All-in ${seat.bet}`);
        } else {
          seat.lastAction = 'call';
          this.addLog(`${seat.name} 跟注 ${pay}`);
        }
        this.emit({ type: 'action', seat: seatIndex, action: applied, amount: pay });
      }
    } else if (action === 'bet' || action === 'raise' || action === 'allin') {
      const maxTarget = seat.bet + seat.stack;
      let target = action === 'allin' ? maxTarget : Math.floor(Number(amount) || 0);
      if (!Number.isFinite(target) || target <= 0) return { ok: false, error: '下注金額不正確' };
      if (target > maxTarget) target = maxTarget;
      const minTarget = Math.min(this.currentBet + this.minRaise, maxTarget);
      if (target < minTarget) {
        return { ok: false, error: `最少需要加到 ${minTarget}` };
      }
      if (target <= this.currentBet && maxTarget > this.currentBet) {
        return { ok: false, error: `最少需要加到 ${minTarget}` };
      }
      const pay = target - seat.bet;
      if (pay <= 0) return { ok: false, error: '下注金額不正確' };
      seat.stack -= pay;
      seat.bet = target;
      seat.committed += pay;
      const raiseSize = target - this.currentBet;
      const isRaise = raiseSize > 0;
      if (isRaise && raiseSize >= this.minRaise) {
        this.minRaise = raiseSize;
        for (const s of this.seats) {
          if (s && s.seat !== seatIndex && !s.folded && !s.allIn) s.acted = false;
        }
      }
      if (target > this.currentBet) this.currentBet = target;
      seat.acted = true;
      if (seat.stack === 0) {
        seat.allIn = true;
        seat.lastAction = 'all in';
        this.addLog(`${seat.name} All-in ${target}`);
        this.emit({ type: 'action', seat: seatIndex, action: 'allin', amount: target });
      } else {
        seat.lastAction = isRaise ? 'raise' : 'bet';
        this.addLog(`${seat.name} ${isRaise ? '加注到' : '下注'} ${target}`);
        this.emit({ type: 'action', seat: seatIndex, action: isRaise ? 'raise' : 'bet', amount: target });
      }
    } else {
      return { ok: false, error: '未知的行動' };
    }

    this.syncPot();
    this.advanceTurn();
    return { ok: true };
  }

  advanceTurn() {
    const alive = this.seats.filter((s) => s && !s.folded && s.cards.length === 2);
    if (alive.length <= 1) {
      this.winByFold();
      return;
    }
    const needing = this.seats.filter(
      (s) => s && !s.folded && !s.allIn && s.cards.length === 2 && (s.bet < this.currentBet || !s.acted),
    );
    if (needing.length === 0) {
      this.endStreet();
      return;
    }
    const next = this.nextToActAfter(this.actingIndex);
    if (next === -1) {
      this.endStreet();
      return;
    }
    this.actingIndex = next;
    this.beginTurn();
  }

  endStreet() {
    for (const s of this.seats) {
      if (!s) continue;
      s.bet = 0;
      s.acted = false;
    }
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    const nextStreet = STREET_NEXT[this.state] || 'showdown';
    if (nextStreet === 'showdown') {
      this.showdown();
      return;
    }
    const canAct = this.seats.filter((s) => s && !s.folded && !s.allIn && s.cards.length === 2);
    this.dealStreet(nextStreet);
    if (canAct.length <= 1) {
      // 只剩一位可以行動 → 直接發完剩餘公牌攤牌
      this.addLog('所有玩家 All-in，發完剩餘公牌');
      this.runOutBoard();
      return;
    }
    this.state = nextStreet;
    this.actingIndex = this.nextToActAfter(this.buttonIndex);
    if (this.actingIndex === -1) {
      this.endStreet();
      return;
    }
    this.broadcast();
    this.beginTurn();
  }

  dealStreet(street) {
    // 燒一張
    this.deck.pop();
    if (street === 'flop') this.board.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
    else this.board.push(this.deck.pop());
    this.state = street;
    this.emit({ type: 'street', street, board: this.board.slice() });
    this.addLog(`${street.toUpperCase()}：${this.board.join(' ')}`);
  }

  runOutBoard() {
    while (this.board.length < 5) {
      this.deck.pop();
      if (this.board.length === 0) this.board.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
      else this.board.push(this.deck.pop());
    }
    this.state = 'river';
    this.emit({ type: 'street', street: 'river', board: this.board.slice() });
    this.showdown();
  }

  buildPots() {
    const contributors = this.seats.filter((s) => s && s.committed > 0);
    const levels = [...new Set(contributors.map((s) => s.committed))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const level of levels) {
      const inLevel = contributors.filter((s) => s.committed >= level);
      const amount = (level - prev) * inLevel.length;
      if (amount > 0) {
        const eligible = inLevel.filter((s) => !s.folded).map((s) => s.seat);
        const last = pots[pots.length - 1];
        if (last && last.eligible.length === eligible.length && last.eligible.every((x) => eligible.includes(x))) {
          last.amount += amount;
        } else {
          pots.push({ amount, eligible });
        }
      }
      prev = level;
    }
    return pots;
  }

  showdown() {
    this.clearTurnTimer();
    this.state = 'showdown';
    this.actingIndex = -1;
    const pots = this.buildPots();
    const contenders = this.seats.filter((s) => s && !s.folded && s.cards.length === 2);
    const evaluated = new Map();
    for (const s of contenders) {
      const ev = evaluateHand([...this.board, ...s.cards]);
      evaluated.set(s.seat, ev);
      s.showCards = true;
      s.handName = ev.name;
    }
    const payouts = new Map();
    const potResults = [];
    for (const pot of pots) {
      const eligible = pot.eligible.map((i) => this.seats[i]).filter((s) => s && evaluated.has(s.seat));
      if (!eligible.length) continue;
      const best = Math.max(...eligible.map((s) => evaluated.get(s.seat).score));
      const winners = eligible.filter((s) => evaluated.get(s.seat).score === best);
      const share = Math.floor(pot.amount / winners.length);
      let remainder = pot.amount - share * winners.length;
      const ordered = this.rotateFrom(this.buttonIndex, winners.map((w) => w.seat));
      for (const idx of ordered) {
        let amt = share;
        if (remainder > 0) {
          amt += 1;
          remainder -= 1;
        }
        payouts.set(idx, (payouts.get(idx) || 0) + amt);
      }
      potResults.push({ amount: pot.amount, winners: ordered, best: evaluated.get(winners[0].seat).name });
    }

    const results = [];
    for (const [seatIdx, amount] of payouts.entries()) {
      const s = this.seats[seatIdx];
      if (!s) continue;
      s.stack += amount;
      s.winAmount = amount;
      s.winCount += 1;
      results.push({
        seat: seatIdx,
        userId: s.userId,
        name: s.name,
        amount,
        hand: evaluated.get(seatIdx) ? evaluated.get(seatIdx).name : '',
        handEn: evaluated.get(seatIdx) ? evaluated.get(seatIdx).nameEn : '',
        best: evaluated.get(seatIdx) ? evaluated.get(seatIdx).best : [],
        cards: s.cards.slice(),
        category: evaluated.get(seatIdx) ? evaluated.get(seatIdx).category : -1,
      });
    }
    const shown = contenders.map((s) => ({
      seat: s.seat,
      cards: s.cards.slice(),
      hand: evaluated.get(s.seat).name,
      best: evaluated.get(s.seat).best,
      won: s.winAmount,
    }));
    this.winners = results;
    this.results = { pots: potResults, winners: results, shown, board: this.board.slice() };
    const totalPot = potResults.reduce((a, p) => a + p.amount, 0);
    this.stats.biggestPot = Math.max(this.stats.biggestPot, totalPot);
    for (const r of results) this.addLog(`${r.name} 贏得 ${r.amount}（${r.hand}）`);
    this.emit({ type: 'showdown', results: this.results });
    this.broadcast();
    this.finishHand();
  }

  winByFold() {
    this.clearTurnTimer();
    const alive = this.seats.filter((s) => s && !s.folded && s.cards.length === 2);
    const winner = alive[0];
    this.state = 'showdown';
    this.actingIndex = -1;
    if (!winner) {
      this.finishHand();
      return;
    }
    const amount = this.totalPot();
    winner.stack += amount;
    winner.winAmount = amount;
    winner.winCount += 1;
    this.winners = [{ seat: winner.seat, userId: winner.userId, name: winner.name, amount, hand: '', cards: [] }];
    this.results = { pots: [], winners: this.winners, shown: [], board: this.board.slice(), byFold: true };
    this.addLog(`${winner.name} 贏得 ${amount}（其他玩家棄牌）`);
    this.emit({ type: 'win', winners: this.winners, amount });
    this.broadcast();
    this.finishHand();
  }

  finishHand() {
    this.clearTurnTimer();
    const summary = {
      tableId: this.id,
      tournamentId: this.tournamentId,
      handNo: this.handNo,
      board: this.board.slice(),
      pot: this.pot,
      startedAt: this.handStartedAt,
      endedAt: Date.now(),
      winners: this.winners,
      players: this.seats.filter(Boolean).map((s) => ({
        seat: s.seat,
        userId: s.userId,
        name: s.name,
        isBot: s.isBot,
        stack: s.stack,
        committed: s.committed,
        cards: s.cards.slice(),
        folded: s.folded,
        hand: s.handName,
        won: s.winAmount,
      })),
    };
    if (this.hooks.onHandComplete) this.hooks.onHandComplete(this, summary);
    this.scheduleNextHand();
  }

  scheduleNextHand() {
    this.clearTimers();
    this.nextHandTimer = setTimeout(() => {
      this.nextHandTimer = null;
      // 清除破產玩家
      for (const s of this.seats) {
        if (s && s.stack <= 0) {
          if (this.hooks.onPlayerBust) this.hooks.onPlayerBust(this, s);
        }
      }
      this.startHand();
    }, this.nextHandDelay);
  }

  // ---------- 前端狀態 ----------
  actionsFor(seat) {
    if (!seat || this.actingIndex !== seat.seat) return null;
    if (!['preflop', 'flop', 'turn', 'river'].includes(this.state)) return null;
    const toCall = Math.max(0, this.currentBet - seat.bet);
    const maxTarget = seat.bet + seat.stack;
    const minTarget = Math.min(this.currentBet + this.minRaise, maxTarget);
    return {
      toCall: Math.min(toCall, seat.stack),
      canCheck: toCall === 0,
      canCall: toCall > 0 && seat.stack > 0,
      canRaise: maxTarget > this.currentBet && seat.stack > 0,
      minRaiseTo: Math.max(minTarget, this.currentBet + 1) > maxTarget ? maxTarget : minTarget,
      maxRaiseTo: maxTarget,
      canAllIn: seat.stack > 0,
      allInTo: maxTarget,
      pot: this.pot,
      currentBet: this.currentBet,
      bigBlind: this.bigBlind,
    };
  }

  getStateFor(viewerId) {
    const viewerSeat = viewerId ? this.seatOf(viewerId) : null;
    const showAll = this.state === 'showdown';
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      clubId: this.clubId,
      code: this.code,
      maxPlayers: this.maxPlayers,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      minBuyIn: this.minBuyIn,
      maxBuyIn: this.maxBuyIn,
      state: this.state,
      handNo: this.handNo,
      board: this.board.slice(),
      pot: this.pot,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      buttonIndex: this.buttonIndex,
      sbIndex: this.sbIndex,
      bbIndex: this.bbIndex,
      actingIndex: this.actingIndex,
      actionEndsAt: this.actionEndsAt,
      tournamentId: this.tournamentId,
      config: this.config,
      seats: this.seats.map((s, idx) => {
        if (!s) return null;
        const isViewer = viewerSeat && viewerSeat.seat === idx;
        const reveal = showAll || isViewer || (s.showCards && s.cards.length === 2);
        return {
          seat: idx,
          userId: s.userId,
          name: s.name,
          avatar: s.avatar,
          level: s.level,
          stack: s.stack,
          bet: s.bet,
          committed: s.committed,
          folded: s.folded,
          allIn: s.allIn,
          acted: s.acted,
          connected: s.connected,
          isBot: s.isBot,
          sittingOut: s.sittingOut,
          lastAction: s.lastAction,
          handName: reveal ? s.handName : null,
          cards: reveal ? s.cards.slice() : s.cards.map(() => 'back'),
          cardCount: s.cards.length,
          winAmount: s.winAmount,
          isViewer: !!isViewer,
          isButton: idx === this.buttonIndex,
          isSmallBlind: idx === this.sbIndex,
          isBigBlind: idx === this.bbIndex,
        };
      }),
      you: viewerSeat
        ? {
            seat: viewerSeat.seat,
            stack: viewerSeat.stack,
            cards: viewerSeat.cards.slice(),
            folded: viewerSeat.folded,
            allIn: viewerSeat.allIn,
            actions: this.actionsFor(viewerSeat),
          }
        : null,
      winners: this.winners,
      results: this.results,
      log: this.log.slice(-14),
      handStartedAt: this.handStartedAt,
    };
  }

  destroy() {
    this.clearTimers();
    this.seats = new Array(this.maxPlayers).fill(null);
  }
}
