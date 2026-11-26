import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { fmt } from '../lib/format';
import { useAuth } from '../state/auth';
import { Avatar } from '../components/Avatar';
import { Segmented, useToast } from '../components/ui';

type Row = {
  rank: number;
  userId: string;
  name: string;
  avatar: string;
  level: number;
  chips: number;
  handsWon: number;
  handsPlayed?: number;
  tournamentsWon?: number;
  value: number;
  isMe?: boolean;
};

const METRICS = [
  { value: 'chips', label: '積分' },
  { value: 'wins', label: '勝場' },
  { value: 'level', label: '等級' },
  { value: 'tournaments', label: '賽事' },
];

export default function Leaderboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [scope, setScope] = useState('global');
  const [metric, setMetric] = useState('chips');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ rows: Row[] }>(`/leaderboard?scope=${scope}&metric=${metric}`);
      setRows(res.rows || []);
    } catch (err: any) {
      toast.push(err?.message || '載入排行榜失敗', 'error');
    } finally {
      setLoading(false);
    }
  }, [scope, metric, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const unit = metric === 'chips' ? '積分' : metric === 'level' ? '等級' : metric === 'wins' ? '勝場' : '冠軍';
  const top3 = rows.slice(0, 3);

  return (
    <main className="page">
      <div className="page-head">
        <h1>排行榜</h1>
      </div>

      <Segmented
        options={[
          { value: 'global', label: '全球' },
          { value: 'friends', label: '好友' },
          { value: 'club', label: '俱樂部' },
        ]}
        value={scope}
        onChange={setScope}
      />
      <div className="scroll-x filters" style={{ marginTop: 10 }}>
        {METRICS.map((m) => (
          <button
            key={m.value}
            className={`chip ${metric === m.value ? 'active' : ''}`}
            onClick={() => setMetric(m.value)}
          >
            {m.label}榜
          </button>
        ))}
      </div>

      {top3.length >= 3 ? (
        <section className="podium">
          {[1, 0, 2].map((idx) => {
            const r = top3[idx];
            if (!r) return null;
            return (
              <button
                key={r.userId}
                className={`podium-item p${idx + 1}`}
                onClick={() => navigate(`/players/${r.userId}`)}
              >
                <Avatar id={r.avatar} name={r.name} size={idx === 0 ? 62 : 50} level={r.level} ring />
                <b>{r.name}</b>
                <span>{fmt(r.value)}</span>
                <i>#{r.rank}</i>
              </button>
            );
          })}
        </section>
      ) : null}

      {loading ? (
        <div className="empty">載入中…</div>
      ) : (
        <div className="list card">
          {rows.map((r) => (
            <button
              key={r.userId}
              className={`rank-row ${r.isMe ? 'me' : ''}`}
              onClick={() => navigate(r.isMe ? '/profile' : `/players/${r.userId}`)}
            >
              <span className={`rank-no ${r.rank <= 3 ? 'g' : ''}`}>{r.rank}</span>
              <Avatar id={r.avatar} name={r.name} size={38} />
              <div className="grow">
                <div className="r-name">
                  {r.name} {r.isMe ? <span className="pill gold">你</span> : null}
                </div>
                <div className="t-sub">
                  Lv.{r.level} · 勝場 {fmt(r.handsWon || 0)}
                  {r.tournamentsWon ? ` · 冠軍 ${r.tournamentsWon}` : ''}
                </div>
              </div>
              <div className="r-value">
                <b>{fmt(r.value)}</b>
                <span>{unit}</span>
              </div>
            </button>
          ))}
          {rows.length === 0 ? (
            <div className="empty">
              {scope === 'friends' ? '尚無好友上榜，先邀請好友一起玩' : '目前沒有排名資料'}
            </div>
          ) : null}
        </div>
      )}

      {user ? (
        <div className="notice-card" style={{ marginTop: 12 }}>
          <b>我的排名</b>
          <span>
            {rows.find((r) => r.isMe)
              ? `第 ${rows.find((r) => r.isMe)!.rank} 名 · ${fmt(rows.find((r) => r.isMe)!.value)} ${unit}`
              : '尚未進入此榜單，多玩幾局就能上榜'}
          </span>
        </div>
      ) : null}
    </main>
  );
}
