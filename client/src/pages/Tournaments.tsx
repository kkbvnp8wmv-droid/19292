import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { fmt, clockText } from '../lib/format';
import { useToast } from '../components/ui';

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
  entries: any[];
  tables: string[];
  prizePool?: number;
  guaranteed?: number;
  blindLevelMs?: number;
  maxPlayers?: number;
};

export const TYPE_LABEL: Record<string, string> = {
  free: '免費賽',
  freeroll: '免費賽',
  sitgo: '單桌賽',
  sitandgo: '單桌賽',
  mtt: '多桌賽',
  scheduled: '定時賽',
  knockout: '淘汰賽',
  ranked: '排名賽',
  beginner: '新手賽',
};

export const STATUS_LABEL: Record<string, string> = {
  registering: '報名中',
  running: '進行中',
  finished: '已結束',
  cancelled: '已取消',
};

const FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'registering', label: '報名中' },
  { value: 'running', label: '進行中' },
  { value: 'free', label: '免費賽' },
  { value: 'sitgo', label: '單桌賽' },
  { value: 'mtt', label: '多桌賽' },
  { value: 'beginner', label: '新手賽' },
];

export default function Tournaments() {
  const navigate = useNavigate();
  const toast = useToast();
  const [list, setList] = useState<Tournament[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ tournaments: Tournament[] }>('/tournaments');
      setList(res.tournaments || []);
    } catch (err: any) {
      toast.push(err?.message || '載入賽事失敗', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const shown = useMemo(() => {
    if (filter === 'all') return list;
    if (filter === 'registering' || filter === 'running') return list.filter((t) => t.status === filter);
    return list.filter((t) => t.type === filter);
  }, [list, filter]);

  const quickRegister = async (t: Tournament) => {
    setBusyId(t.id);
    try {
      await api(`/tournaments/${t.id}/register`, { method: 'POST', body: {} });
      toast.push('報名成功，開賽時自動分桌', 'success');
      load();
    } catch (err: any) {
      toast.push(err?.message || '報名失敗', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="page">
      <div className="page-head">
        <h1>錦標賽中心</h1>
      </div>

      <div className="scroll-x filters">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className={`chip ${filter === f.value ? 'active' : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty">載入賽事中…</div>
      ) : (
        <div className="list">
          {shown.map((t) => {
            const blinds = t.blinds || { smallBlind: t.smallBlind, bigBlind: t.bigBlind };
            return (
              <article className={`tour-card ${t.status}`} key={t.id}>
                <div className="tour-top">
                  <div className="grow">
                    <div className="tour-name">{t.name}</div>
                    <div className="t-sub">
                      {TYPE_LABEL[t.type] || t.type} · {STATUS_LABEL[t.status] || t.status}
                    </div>
                  </div>
                  <span className={`pill ${t.status === 'running' ? 'green' : t.status === 'finished' ? '' : 'gold'}`}>
                    {STATUS_LABEL[t.status] || t.status}
                  </span>
                </div>
                <div className="tour-grid">
                  <div>
                    <span>買入</span>
                    <b>{t.buyIn ? fmt(t.buyIn) : '免費'}</b>
                  </div>
                  <div>
                    <span>起始籌碼</span>
                    <b>{fmt(t.startingStack)}</b>
                  </div>
                  <div>
                    <span>盲注</span>
                    <b>
                      {blinds.smallBlind}/{blinds.bigBlind}
                    </b>
                  </div>
                  <div>
                    <span>人數</span>
                    <b>{t.registered ?? 0}/{t.playing ? `${t.playing} 進行` : (t.maxPlayers || '∞')}</b>
                  </div>
                </div>
                <div className="tour-foot">
                  <span className="muted">
                    {t.status === 'registering'
                      ? `開賽 ${clockText(t.startAt)}`
                      : t.status === 'running'
                        ? `第 ${(t.level || 0) + 1} 級別`
                        : '賽事已結束'}
                  </span>
                  <div className="tour-btns">
                    <button className="btn ghost sm" onClick={() => navigate(`/tournaments/${t.id}`)}>
                      詳情
                    </button>
                    {t.status === 'registering' ? (
                      <button
                        className="btn gold sm"
                        onClick={() => quickRegister(t)}
                        disabled={busyId === t.id}
                      >
                        報名
                      </button>
                    ) : t.status === 'running' ? (
                      <button className="btn gold sm" onClick={() => navigate(`/tournaments/${t.id}`)}>
                        進入
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
          {shown.length === 0 ? <div className="empty">此分類目前沒有賽事</div> : null}
        </div>
      )}
    </main>
  );
}
