import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { fmt } from '../lib/format';
import { useAuth } from '../state/auth';
import { Segmented, Sheet, useToast } from '../components/ui';
import { TableEmblem } from '../components/Logo';

type TableInfo = {
  id: string;
  name: string;
  kind: string;
  maxPlayers: number;
  players: number;
  humans: number;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  status: string;
  hot?: boolean;
  clubId?: string | null;
  avgStack?: number;
};

const FILTERS = [
  { value: 'all', label: '全部' },
  { value: '2', label: '2 人桌' },
  { value: '6', label: '6 人桌' },
  { value: '9', label: '9 人桌' },
  { value: 'beginner', label: '新手桌' },
  { value: 'club', label: '俱樂部桌' },
];

export default function Tables() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TableInfo | null>(null);
  const [buyIn, setBuyIn] = useState(0);
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ tables: TableInfo[] }>('/tables');
      setTables(res.tables || []);
    } catch (err: any) {
      toast.push(err?.message || '載入牌桌失敗', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, [load]);

  const shown = useMemo(() => {
    let list = tables;
    if (filter === 'beginner' || filter === 'club') list = list.filter((t) => t.kind === filter);
    else if (filter !== 'all') list = list.filter((t) => String(t.maxPlayers) === filter);
    return list.sort((a, b) => b.humans - a.humans || b.players - a.players);
  }, [tables, filter]);

  const openJoin = (t: TableInfo) => {
    const min = t.minBuyIn || 100;
    const max = t.maxBuyIn || min * 5;
    if ((user?.chips || 0) < min) {
      toast.push('積分不足，請先領取免費積分', 'error');
      return;
    }
    setSelected(t);
    setBuyIn(Math.min(max, Math.max(min, Math.floor((user?.chips || min) / 2))));
  };

  const confirmJoin = async () => {
    if (!selected) return;
    setJoining(true);
    try {
      await api(`/tables/${selected.id}/join`, { method: 'POST', body: { buyIn } });
      navigate(`/table/${selected.id}`);
    } catch (err: any) {
      toast.push(err?.message || '加入牌桌失敗', 'error');
    } finally {
      setJoining(false);
    }
  };

  const quickStart = async () => {
    try {
      const res = await api<{ tableId: string }>('/tables/quick', { method: 'POST', body: {} });
      navigate(`/table/${res.tableId}`);
    } catch (err: any) {
      toast.push(err?.message || '找不到合適牌桌', 'error');
    }
  };

  return (
    <main className="page">
      <div className="page-head">
        <h1>牌桌大廳</h1>
        <button className="btn gold sm" onClick={quickStart}>
          快速開始
        </button>
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
        <div className="empty">載入牌桌中…</div>
      ) : (
        <div className="table-grid">
          {shown.map((t) => {
            const full = t.players >= t.maxPlayers;
            const seats = Array.from({ length: t.maxPlayers });
            return (
              <article className="table-card" key={t.id}>
                <div className="table-card-felt">
                  <TableEmblem size={44} />
                  <span className="tc-kind">
                    {t.kind === 'beginner' ? '新手' : t.kind === 'club' ? '俱樂部' : '公開'}
                  </span>
                  {t.hot ? <span className="tc-hot">熱門</span> : null}
                  <div className="seat-dots">
                    {seats.map((_, i) => (
                      <i key={i} className={i < t.players ? 'on' : ''} />
                    ))}
                  </div>
                </div>
                <div className="table-card-body">
                  <h3>{t.name}</h3>
                  <div className="tc-meta">
                    <span>盲注 {t.smallBlind}/{t.bigBlind}</span>
                    <span>
                      {t.players}/{t.maxPlayers} 人
                    </span>
                  </div>
                  <div className="tc-meta">
                    <span>買入 {fmt(t.minBuyIn)}–{fmt(t.maxBuyIn)}</span>
                    <span className={t.humans > 0 ? 'online' : ''}>
                      {t.humans > 0 ? `${t.humans} 位真人` : 'AI 牌友'}
                    </span>
                  </div>
                  <button
                    className={`btn block ${full ? 'ghost' : 'gold'}`}
                    onClick={() => openJoin(t)}
                    disabled={full}
                  >
                    {full ? '牌桌已滿' : '加入牌桌'}
                  </button>
                </div>
              </article>
            );
          })}
          {shown.length === 0 ? <div className="empty">此分類目前沒有牌桌</div> : null}
        </div>
      )}

      {selected ? (
        <Sheet title={selected.name} onClose={() => setSelected(null)}>
          <div className="kv">
            <span>盲注</span>
            <b>
              {selected.smallBlind} / {selected.bigBlind}
            </b>
          </div>
          <div className="kv">
            <span>人數</span>
            <b>
              {selected.players} / {selected.maxPlayers}
            </b>
          </div>
          <div className="kv">
            <span>買入範圍</span>
            <b>
              {fmt(selected.minBuyIn)} – {fmt(selected.maxBuyIn)}
            </b>
          </div>
          <div className="kv">
            <span>我的積分</span>
            <b>{fmt(user?.chips || 0)}</b>
          </div>
          <label className="slider-label">
            <span>帶入積分</span>
            <b>{fmt(buyIn)}</b>
          </label>
          <input
            className="range"
            type="range"
            min={selected.minBuyIn}
            max={Math.min(selected.maxBuyIn, user?.chips || selected.maxBuyIn)}
            step={Math.max(1, Math.floor(selected.smallBlind))}
            value={buyIn}
            onChange={(e) => setBuyIn(Number(e.target.value))}
          />
          <div className="quick-bets">
            {[0.25, 0.5, 0.75, 1].map((r) => {
              const max = Math.min(selected.maxBuyIn, user?.chips || selected.maxBuyIn);
              const v = Math.round(selected.minBuyIn + (max - selected.minBuyIn) * r);
              return (
                <button key={r} className="chip" onClick={() => setBuyIn(v)}>
                  {Math.round(r * 100)}%
                </button>
              );
            })}
          </div>
          <button className="btn gold block lg" style={{ marginTop: 14 }} onClick={confirmJoin} disabled={joining}>
            {joining ? '入座中…' : '確認入座'}
          </button>
        </Sheet>
      ) : null}
    </main>
  );
}
