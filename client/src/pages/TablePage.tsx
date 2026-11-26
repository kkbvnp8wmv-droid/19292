import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { connectSocket } from '../lib/socket';
import { fmt, EMOTES, ACTION_LABEL } from '../lib/format';
import { useAuth } from '../state/auth';
import { PlayingCard } from '../components/PlayingCard';
import { Avatar } from '../components/Avatar';
import { Sheet, useToast, useInterval } from '../components/ui';
import { TableEmblem } from '../components/Logo';

type Seat = {
  seat: number;
  userId: string;
  name: string;
  avatar: string;
  level: number;
  stack: number;
  bet: number;
  committed: number;
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  connected: boolean;
  isBot: boolean;
  sittingOut: boolean;
  lastAction: string | null;
  handName: string | null;
  cards: string[];
  cardCount: number;
  winAmount: number;
  isViewer: boolean;
  isButton: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
};

type Actions = {
  toCall: number;
  canCheck: boolean;
  canCall: boolean;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
  canAllIn: boolean;
  allInTo: number;
  pot: number;
  currentBet: number;
  bigBlind: number;
};

type TableState = {
  id: string;
  name: string;
  kind: string;
  clubId: string | null;
  code: string | null;
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  state: string;
  handNo: number;
  board: string[];
  pot: number;
  currentBet: number;
  minRaise: number;
  buttonIndex: number;
  actingIndex: number;
  actionEndsAt: number;
  tournamentId: string | null;
  seats: (Seat | null)[];
  you: { seat: number; stack: number; cards: string[]; folded: boolean; allIn: boolean; actions: Actions | null } | null;
  winners: any;
  results: any;
  log: string[];
  handStartedAt: number;
};

type ChatMsg = { userId: string | null; name: string; avatar: string; text: string; kind: string };

const STATE_LABEL: Record<string, string> = {
  waiting: '等待玩家',
  preflop: '翻牌前',
  flop: '翻牌圈',
  turn: '轉牌圈',
  river: '河牌圈',
  showdown: '攤牌',
};

function seatStyle(index: number, max: number, viewerSeat: number | null) {
  const slot = viewerSeat === null ? index : (index - viewerSeat + max) % max;
  const rad = ((90 + (slot * 360) / max) * Math.PI) / 180;
  return {
    left: `${50 + 41 * Math.cos(rad)}%`,
    top: `${50 + 38 * Math.sin(rad)}%`,
  };
}

export default function TablePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, applyWallet } = useAuth();
  const socket = useMemo(() => connectSocket(), []);

  const [state, setState] = useState<TableState | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [now, setNow] = useState(Date.now());
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const [logOpen, setLogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sitOpen, setSitOpen] = useState(false);
  const [buyIn, setBuyIn] = useState(0);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [raiseTo, setRaiseTo] = useState(0);
  const [sound, setSound] = useState(() => localStorage.getItem('pc_sound') !== '0');
  const [fast, setFast] = useState(() => localStorage.getItem('pc_fast') === '1');
  const chatRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onState = (s: TableState) => {
      setState(s);
      setRaiseOpen(false);
    };
    const onChat = (m: ChatMsg) => setMessages((prev) => [...prev.slice(-60), m]);
    const onHistory = ({ messages: list }: { messages: ChatMsg[] }) => setMessages(list || []);
    const onSeated = ({ user: u }: { user: any }) => {
      if (u) applyWallet(u.chips);
      setSitOpen(false);
      toast.push('已入座，祝你好運！', 'success');
    };
    const onLeft = ({ refund }: { refund: number }) => {
      toast.push(refund > 0 ? `已離桌，退回 ${fmt(refund)} 積分` : '已離桌', 'info');
      navigate('/tables');
    };
    const onError = ({ error }: { error: string }) => toast.push(error || '操作失敗', 'error');
    const onWallet = ({ chips }: { chips: number }) => applyWallet(chips);
    const onNotify = ({ text }: { text: string }) => toast.push(text, 'info');

    socket.on('table:state', onState);
    socket.on('table:chat', onChat);
    socket.on('table:chat:history', onHistory);
    socket.on('table:seated', onSeated);
    socket.on('table:left', onLeft);
    socket.on('table:error', onError);
    socket.on('wallet:update', onWallet);
    socket.on('notify', onNotify);
    socket.emit('table:subscribe', { tableId: id });

    return () => {
      socket.emit('table:unsubscribe', { tableId: id });
      socket.off('table:state', onState);
      socket.off('table:chat', onChat);
      socket.off('table:chat:history', onHistory);
      socket.off('table:seated', onSeated);
      socket.off('table:left', onLeft);
      socket.off('table:error', onError);
      socket.off('wallet:update', onWallet);
      socket.off('notify', onNotify);
    };
  }, [id, socket, navigate, toast, applyWallet]);

  useInterval(() => setNow(Date.now()), 200);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, chatOpen]);

  useEffect(() => {
    localStorage.setItem('pc_sound', sound ? '1' : '0');
    localStorage.setItem('pc_fast', fast ? '1' : '0');
  }, [sound, fast]);

  useEffect(() => {
    if (state && !state.you && !sitOpen) {
      setBuyIn(Math.min(state.maxBuyIn, Math.max(state.minBuyIn, Math.floor((user?.chips || 0) / 2))));
      setSitOpen(true);
    }
  }, [state, sitOpen, user?.chips]);

  const act = useCallback(
    (action: string, amount = 0) => {
      socket.emit('table:action', { tableId: id, action, amount });
      setRaiseOpen(false);
    },
    [socket, id],
  );

  const sit = () => {
    socket.emit('table:sit', { tableId: id, buyIn });
  };

  const leave = () => {
    socket.emit('table:leave', { tableId: id });
  };

  const sendChat = (text: string, kind = 'chat') => {
    const value = text.trim();
    if (!value) return;
    socket.emit('table:chat', { tableId: id, text: value, kind });
    setChatText('');
  };

  if (!state) {
    return (
      <main className="page table-loading">
        <div className="empty">
          <TableEmblem size={64} />
          <div style={{ marginTop: 12 }}>正在連線牌桌…</div>
        </div>
      </main>
    );
  }

  const you = state.you;
  const actions = you?.actions || null;
  const myTurn = !!actions;
  const actingSeat = state.actingIndex >= 0 ? state.seats[state.actingIndex] : null;
  const remaining = Math.max(0, (state.actionEndsAt || 0) - now);
  const seconds = Math.ceil(remaining / 1000);
  const totalTime = Math.max(1, state.actionEndsAt ? 25000 : 1);
  const winnersList: any[] = Array.isArray(state.winners) ? state.winners : [];
  const inHand = !!you && !you.folded && !you.allIn;

  const openRaise = () => {
    if (!actions) return;
    setRaiseTo(Math.min(actions.maxRaiseTo, Math.max(actions.minRaiseTo, Math.round(actions.currentBet * 2 || actions.bigBlind * 3))));
    setRaiseOpen(true);
  };

  const confirmRaise = () => {
    if (!actions) return;
    const amount = Math.min(actions.maxRaiseTo, Math.max(actions.minRaiseTo, raiseTo));
    if (amount >= actions.allInTo) act('allin');
    else act(actions.currentBet > 0 ? 'raise' : 'bet', amount);
  };

  return (
    <div className={`table-page ${fast ? 'fast' : ''}`}>
      <header className="table-top">
        <button className="icon-btn" onClick={() => navigate('/tables')} aria-label="返回">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="tt-center">
          <div className="tt-name">
            {state.name}
            {state.code ? <span className="pill gold">{state.code}</span> : null}
          </div>
          <div className="tt-sub">
            盲注 {state.smallBlind}/{state.bigBlind} · {STATE_LABEL[state.state] || state.state} · 第 {state.handNo} 局
          </div>
        </div>
        <div className="tt-actions">
          <button className="icon-btn" onClick={() => setLogOpen(true)} aria-label="牌局紀錄">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
            </svg>
          </button>
          <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="設定">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6l2.1 2.1m0-12.8l-2.1 2.1M7.7 16.3l-2.1 2.1" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      <div className="felt-wrap">
        <div className="felt">
          {state.seats.map((s, i) => {
            if (!s) return null;
            const style = seatStyle(i, state.maxPlayers, you ? you.seat : null);
            const isTurn = state.actingIndex === i && ['preflop', 'flop', 'turn', 'river'].includes(state.state);
            return (
              <div
                key={i}
                className={`seat ${isTurn ? 'turn' : ''} ${s.folded ? 'folded' : ''} ${
                  s.winAmount > 0 ? 'winner' : ''
                }`}
                style={style}
              >
                {s.handName ? <span className="hand-name">{s.handName}</span> : null}
                <div className="seat-box">
                  {isTurn ? <span className="timer-ring" /> : null}
                  <div className="s-cards">
                    {Array.from({ length: s.cardCount || 0 }).map((_, ci) => (
                      <PlayingCard key={ci} card={s.cards[ci] || 'back'} size="seat" />
                    ))}
                  </div>
                  <Avatar id={s.avatar} name={s.name} size={34} />
                  <div className="s-name">{s.name}</div>
                  <div className="s-stack">{fmt(s.stack)}</div>
                  {!s.connected ? <span className="pill red mini">斷線</span> : null}
                  {s.allIn ? <span className="pill red mini">ALL IN</span> : null}
                </div>
                {s.isButton ? <span className="dealer-btn">D</span> : null}
                {s.isSmallBlind || s.isBigBlind ? (
                  <span className="blinds">{s.isSmallBlind ? 'SB' : 'BB'}</span>
                ) : null}
                {s.bet > 0 ? (
                  <div className="bet-chip">
                    <i className="chip-dot" />
                    {fmt(s.bet)}
                  </div>
                ) : null}
                {s.lastAction ? (
                  <span className={`act-tag ${s.lastAction}`}>{ACTION_LABEL[s.lastAction] || s.lastAction}</span>
                ) : null}
                {s.winAmount > 0 ? <span className="win-float">+{fmt(s.winAmount)}</span> : null}
              </div>
            );
          })}

          <div className="table-center">
            <div className="board-row">
              {state.board.map((c, i) => (
                <PlayingCard key={`${c}-${i}`} card={c} size="lg" className="dealt" delay={i * 80} />
              ))}
              {Array.from({ length: Math.max(0, 5 - state.board.length) }).map((_, i) => (
                <div key={`ph-${i}`} className="card-slot" />
              ))}
            </div>
            <div className="pot-chip">
              <i className="chip-icon" /> 底池 {fmt(state.pot)}
            </div>
            {state.currentBet > 0 ? <span className="bet-level">目前注額 {fmt(state.currentBet)}</span> : null}
          </div>
        </div>
      </div>

      {winnersList.length > 0 ? (
        <div className="winner-banner">
          <b>本局結果</b>
          {winnersList.map((w, i) => (
            <span key={i}>
              {w.name || w.displayName} 以 {w.handName || '最佳牌型'} 贏得 {fmt(w.amount || w.winAmount || 0)}
            </span>
          ))}
        </div>
      ) : null}

      <div className="my-zone">
        {you ? (
          <div className="my-cards">
            {you.cards.map((c, i) => (
              <PlayingCard key={`${c}-${i}`} card={c} size="lg" className="dealt" delay={i * 90} />
            ))}
            {you.folded ? <span className="pill red">已蓋牌</span> : null}
          </div>
        ) : null}

        {raiseOpen && actions ? (
          <div className="raise-sheet">
            <div className="rs-head">
              <span>加注至</span>
              <b>{fmt(raiseTo)}</b>
            </div>
            <input
              className="range"
              type="range"
              min={actions.minRaiseTo}
              max={actions.maxRaiseTo}
              step={Math.max(1, Math.floor(state.bigBlind / 2))}
              value={raiseTo}
              onChange={(e) => setRaiseTo(Number(e.target.value))}
            />
            <div className="quick-bets">
              {[
                { label: '1/2 池', v: actions.currentBet + Math.round(actions.pot * 0.5) },
                { label: '2/3 池', v: actions.currentBet + Math.round(actions.pot * 0.66) },
                { label: '底池', v: actions.currentBet + actions.pot },
                { label: 'All-in', v: actions.allInTo },
              ].map((p) => (
                <button
                  key={p.label}
                  className="chip"
                  onClick={() => setRaiseTo(Math.min(actions.maxRaiseTo, Math.max(actions.minRaiseTo, p.v)))}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="rs-buttons">
              <button className="btn ghost" onClick={() => setRaiseOpen(false)}>
                取消
              </button>
              <button className="btn gold grow" onClick={confirmRaise}>
                確認 {raiseTo >= actions.allInTo ? 'All-in' : actions.currentBet > 0 ? '加注' : '下注'} {fmt(raiseTo)}
              </button>
            </div>
          </div>
        ) : null}

        {myTurn && actions && !raiseOpen ? (
          <>
            <div className="turn-strip">
              <span>輪到你行動</span>
              <div className="timer-bar">
                <i style={{ width: `${Math.min(100, (remaining / totalTime) * 100)}%` }} />
              </div>
              <b>{seconds}s</b>
            </div>
            <div className="action-bar">
              <button className="action-btn fold" onClick={() => act('fold')}>
                蓋牌
                <small>Fold</small>
              </button>
              {actions.canCheck ? (
                <button className="action-btn check" onClick={() => act('check')}>
                  過牌
                  <small>Check</small>
                </button>
              ) : (
                <button className="action-btn call" onClick={() => act('call')} disabled={!actions.canCall}>
                  跟注
                  <small>{fmt(actions.toCall)}</small>
                </button>
              )}
              <button className="action-btn raise" onClick={openRaise} disabled={!actions.canRaise}>
                {actions.currentBet > 0 ? '加注' : '下注'}
                <small>{fmt(actions.minRaiseTo)}+</small>
              </button>
              <button className="action-btn allin" onClick={() => act('allin')} disabled={!actions.canAllIn}>
                All-in
                <small>{fmt(actions.allInTo)}</small>
              </button>
            </div>
          </>
        ) : (
          <div className="waiting-strip">
            {!you
              ? '你正在觀戰，入座即可加入牌局'
              : state.state === 'showdown'
                ? '本局結束，正在發下一局…'
                : state.state === 'waiting'
                  ? '等待玩家入座開局…'
                  : `等待 ${actingSeat ? actingSeat.name : '其他玩家'} 行動${
                      state.actionEndsAt ? ` · ${seconds}s` : ''
                    }`}
          </div>
        )}

        <div className="table-bottom">
          <button className="btn ghost sm" onClick={() => setChatOpen((v) => !v)}>
            聊天 {chatOpen ? '▾' : '▴'}
          </button>
          {EMOTES.slice(0, 4).map((e) => (
            <button key={e} className="emoji-btn" onClick={() => sendChat(e, 'emote')}>
              {e}
            </button>
          ))}
          <button className="btn danger sm" onClick={leave}>
            離桌
          </button>
        </div>
      </div>

      {chatOpen ? (
        <div className="chat-panel">
          <div className="chat-list" ref={chatRef}>
            {messages.map((m, i) => (
              <div key={i} className={`chat-line ${m.kind === 'emote' ? 'emote' : ''}`}>
                <b>{m.name}</b>
                <span>{m.text}</span>
              </div>
            ))}
            {messages.length === 0 ? <div className="empty">尚無聊天訊息</div> : null}
          </div>
          <div className="chat-input">
            <input
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendChat(chatText)}
              placeholder="輸入訊息…"
              maxLength={120}
            />
            <button className="btn gold sm" onClick={() => sendChat(chatText)}>
              送出
            </button>
          </div>
          <div className="emote-row">
            {EMOTES.map((e) => (
              <button key={e} className="emoji-btn" onClick={() => sendChat(e, 'emote')}>
                {e}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {sitOpen ? (
        <Sheet
          title={`入座 · ${state.name}`}
          onClose={() => (state.you ? setSitOpen(false) : navigate('/tables'))}
          footer={
            <button className="btn gold block lg" onClick={sit} disabled={(user?.chips || 0) < state.minBuyIn}>
              {(user?.chips || 0) < state.minBuyIn ? '積分不足' : `入座並帶入 ${fmt(buyIn)}`}
            </button>
          }
        >
          <div className="kv">
            <span>盲注</span>
            <b>
              {state.smallBlind} / {state.bigBlind}
            </b>
          </div>
          <div className="kv">
            <span>帶入範圍</span>
            <b>
              {fmt(state.minBuyIn)} – {fmt(state.maxBuyIn)}
            </b>
          </div>
          <div className="kv">
            <span>我的積分</span>
            <b>{fmt(user?.chips || 0)}</b>
          </div>
          <input
            className="range"
            type="range"
            min={state.minBuyIn}
            max={Math.min(state.maxBuyIn, Math.max(state.minBuyIn, user?.chips || state.minBuyIn))}
            step={Math.max(1, state.bigBlind)}
            value={buyIn}
            onChange={(e) => setBuyIn(Number(e.target.value))}
          />
          <div className="quick-bets">
            {[0.25, 0.5, 0.75, 1].map((r) => {
              const max = Math.min(state.maxBuyIn, Math.max(state.minBuyIn, user?.chips || state.minBuyIn));
              const v = Math.round(state.minBuyIn + (max - state.minBuyIn) * r);
              return (
                <button key={r} className="chip" onClick={() => setBuyIn(v)}>
                  {Math.round(r * 100)}%
                </button>
              );
            })}
          </div>
        </Sheet>
      ) : null}

      {logOpen ? (
        <Sheet title="牌局紀錄" onClose={() => setLogOpen(false)}>
          <div className="log-list">
            {(state.log || []).slice().reverse().map((l, i) => (
              <div key={i} className="log-line">
                {l}
              </div>
            ))}
            {(state.log || []).length === 0 ? <div className="empty">尚無紀錄</div> : null}
          </div>
        </Sheet>
      ) : null}

      {settingsOpen ? (
        <Sheet title="牌桌設定" onClose={() => setSettingsOpen(false)}>
          <label className="check-row">
            <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
            <span>音效</span>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={fast} onChange={(e) => setFast(e.target.checked)} />
            <span>快速動畫（低效能模式）</span>
          </label>
          <div className="kv">
            <span>桌號</span>
            <b>{state.id.slice(-6)}</b>
          </div>
          {state.code ? (
            <div className="kv">
              <span>邀請碼</span>
              <b>{state.code}</b>
            </div>
          ) : null}
          <button className="btn ghost block" onClick={() => navigate('/settings')}>
            前往完整設定
          </button>
          <button className="btn danger block" onClick={leave}>
            離桌並退回積分
          </button>
        </Sheet>
      ) : null}
    </div>
  );
}
