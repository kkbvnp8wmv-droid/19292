import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { fmt, clockText, timeAgo } from '../lib/format';
import { useAuth } from '../state/auth';
import { connectSocket } from '../lib/socket';
import { Avatar } from '../components/Avatar';
import { useToast } from '../components/ui';

type Entry = {
  userId: string;
  name: string;
  avatar: string;
  chips: number;
  status: string;
  place: number | null;
  isBot?: boolean;
  tableId?: string | null;
};

type Tournament = {
  id: string;
  name: string;
  type: string;
  status: string;
  buyIn: number;
  startingStack: number;
  startAt: number | null;
  smallBlind: number;
  bigBlind: number;
  level: number;
  blinds?: { smallBlind: number; bigBlind: number };
  registered: number;
  playing: number;
  entries: Entry[];
  tables: string[];
  prizePool?: number;
  blindLevelMs?: number;
  startedAt?: number;
  finishedAt?: number;
};

const TYPE_LABEL: Record<string, string> = {
  free: '免費賽',
  freeroll: '免費賽',
  sitgo: '單桌賽',
  mtt: '多桌賽',
  scheduled: '定時賽',
  knockout: '淘汰賽',
  ranked: '排名賽',
  beginner: '新手賽',
};

const STATUS_LABEL: Record<string, string> = {
  registering: '報名中',
  running: '進行中',
  finished: '已結束',
};

const ENTRY_STATUS: Record<string, string> = {
  registered: '已報名',
  playing: '比賽中',
  eliminated: '已淘汰',
  winner: '冠軍',
};

export default function TournamentDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, applyWallet } = useAuth();
  const socket = useMemo(() => connectSocket(), []);
  const [tour, setTour] = useState<Tournament | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ tournament: Tournament }>(`/tournaments/${id}`);
      setTour(res.tournament);
    } catch (err: any) {
      toast.push(err?.message || '載入賽事失敗', 'error');
    }
  }, [id, toast]);

  useEffect(() => {
    load();
    const onState = (t: Tournament) => {
      if (t && t.id === id) setTour(t);
    };
    const onUpdate = ({ tournamentId }: { tournamentId: string }) => {
      if (tournamentId === id) load();
    };
    socket.on('tournament:state', onState);
    socket.on('tournament:update', onUpdate);
    socket.emit('tournament:subscribe', { tournamentId: id });
    const timer = setInterval(load, 12000);
    return () => {
      socket.off('tournament:state', onState);
      socket.off('tournament:update', onUpdate);
      clearInterval(timer);
    };
  }, [id, socket, load]);

  const myEntry = tour?.entries?.find((e) => e.userId === user?.id);

  const register = async () => {
    setBusy(true);
    try {
      const res = await api<{ tournament: Tournament }>(`/tournaments/${id}/register`, {
        method: 'POST',
        body: {},
      });
      setTour(res.tournament);
      toast.push('報名成功！', 'success');
    } catch (err: any) {
      toast.push(err?.message || '報名失敗', 'error');
    } finally {
      setBusy(false);
    }
  };

  const unregister = async () => {
    setBusy(true);
    try {
      const res = await api<{ tournament: Tournament }>(`/tournaments/${id}/unregister`, {
        method: 'POST',
        body: {},
      });
      setTour(res.tournament);
      toast.push('已取消報名', 'info');
    } catch (err: any) {
      toast.push(err?.message || '取消失敗', 'error');
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setBusy(true);
    try {
      const res = await api<{ tournament: Tournament }>(`/tournaments/${id}/start`, {
        method: 'POST',
        body: {},
      });
      setTour(res.tournament);
      toast.push('賽事開始，正在分桌', 'success');
    } catch (err: any) {
      toast.push(err?.message || '無法開賽', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!tour) {
    return (
      <main className="page">
        <div className="empty">載入賽事中…</div>
      </main>
    );
  }

  const blinds = tour.blinds || { smallBlind: tour.smallBlind, bigBlind: tour.bigBlind };
  const ranked = [...(tour.entries || [])].sort((a, b) => (a.place || 999) - (b.place || 999) || b.chips - a.chips);

  return (
    <main className="page">
      <div className="page-head">
        <button className="icon-btn" onClick={() => navigate('/tournaments')} aria-label="返回">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 style={{ fontSize: 17 }}>{tour.name}</h1>
      </div>

      <section className="card tour-hero">
        <div className="tour-hero-top">
          <span className={`pill ${tour.status === 'running' ? 'green' : 'gold'}`}>
            {STATUS_LABEL[tour.status] || tour.status}
          </span>
          <span className="pill">{TYPE_LABEL[tour.type] || tour.type}</span>
          <span className="pill">{tour.registered ?? 0} 人報名</span>
        </div>
        <div className="tour-grid big">
          <div>
            <span>買入</span>
            <b>{tour.buyIn ? fmt(tour.buyIn) : '免費'}</b>
          </div>
          <div>
            <span>起始籌碼</span>
            <b>{fmt(tour.startingStack)}</b>
          </div>
          <div>
            <span>目前盲注</span>
            <b>
              {blinds.smallBlind}/{blinds.bigBlind}
            </b>
          </div>
          <div>
            <span>{tour.status === 'running' ? '級別' : '開賽'}</span>
            <b>{tour.status === 'running' ? `Lv.${(tour.level || 0) + 1}` : clockText(tour.startAt)}</b>
          </div>
        </div>
        {myEntry ? (
          <div className="my-entry">
            <span>我的狀態</span>
            <b>{ENTRY_STATUS[myEntry.status] || myEntry.status}</b>
            <span>籌碼 {fmt(myEntry.chips)}</span>
          </div>
        ) : null}
        <div className="tour-actions">
          {tour.status === 'registering' ? (
            myEntry ? (
              <button className="btn ghost block" onClick={unregister} disabled={busy}>
                取消報名
              </button>
            ) : (
              <button className="btn gold block lg" onClick={register} disabled={busy}>
                {busy ? '報名中…' : `報名參賽${tour.buyIn ? ` · ${fmt(tour.buyIn)}` : ''}`}
              </button>
            )
          ) : null}
          {tour.status === 'registering' && myEntry ? (
            <button className="btn outline block" onClick={start} disabled={busy}>
              立即開賽（測試用）
            </button>
          ) : null}
          {tour.status === 'running' && myEntry?.tableId ? (
            <button className="btn gold block lg" onClick={() => navigate(`/table/${myEntry.tableId}`)}>
              進入我的牌桌
            </button>
          ) : null}
          {tour.status === 'finished' ? (
            <div className="waiting-strip">賽事已結束 · {timeAgo(tour.finishedAt || Date.now())}</div>
          ) : null}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>參賽玩家</h3>
          <span className="muted">{tour.entries?.length || 0} 人</span>
        </div>
        <div className="list">
          {ranked.map((e, i) => (
            <button
              key={e.userId}
              className={`tile clickable ${e.userId === user?.id ? 'me' : ''}`}
              onClick={() => navigate(`/players/${e.userId}`)}
            >
              <span className="rank-no">{e.place || i + 1}</span>
              <Avatar id={e.avatar} name={e.name} size={36} />
              <div className="t-main">
                <div className="t-title">{e.name}</div>
                <div className="t-sub">
                  {ENTRY_STATUS[e.status] || e.status}
                  {e.isBot ? ' · AI' : ''}
                </div>
              </div>
              <div className="t-side">
                <b>{fmt(e.chips)}</b>
              </div>
            </button>
          ))}
          {ranked.length === 0 ? <div className="empty">尚無人報名，成為第一位挑戰者</div> : null}
        </div>
      </section>

      {tour.tables?.length ? (
        <section className="card">
          <div className="card-head">
            <h3>賽事牌桌</h3>
          </div>
          <div className="list">
            {tour.tables.map((tid, i) => (
              <button key={tid} className="tile clickable" onClick={() => navigate(`/table/${tid}`)}>
                <div className="t-main">
                  <div className="t-title">桌 {i + 1}</div>
                  <div className="t-sub">點擊觀戰或入座</div>
                </div>
                <div className="t-side">
                  <span className="btn sm gold">前往</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card">
        <div className="card-head">
          <h3>賽事規則</h3>
        </div>
        <ul className="rule-list">
          <li>每 {Math.round((tour.blindLevelMs || 180000) / 60000)} 分鐘升盲，起始籌碼 {fmt(tour.startingStack)}。</li>
          <li>系統自動分桌，人數不足時由 AI 牌友補位。</li>
          <li>淘汰後不可重新買入，最後一位玩家即為冠軍。</li>
          <li>最終桌結束後自動結算名次與獎勵積分。</li>
        </ul>
      </section>
    </main>
  );
}
