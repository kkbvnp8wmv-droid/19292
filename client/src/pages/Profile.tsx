import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { fmt, fmtFull, dateText, HAND_LABEL } from '../lib/format';
import { useAuth } from '../state/auth';
import { Avatar, AVATAR_OPTIONS } from '../components/Avatar';
import { Sheet, Stat, useToast } from '../components/ui';

type Stats = {
  handsPlayed?: number;
  handsWon?: number;
  winRate?: number;
  biggestPot?: number;
  showdownWon?: number;
  allIns?: number;
  tournamentWins?: number;
  handTypes?: number[];
  [key: string]: any;
};

type Hand = {
  id: string;
  tableName?: string;
  createdAt?: number;
  winners?: { userId: string; name: string; amount: number }[];
  pot?: number;
  players?: { userId: string; name: string; avatar?: string }[];
  [key: string]: any;
};

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [stats, setStats] = useState<Stats>({});
  const [hands, setHands] = useState<Hand[]>([]);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [tab, setTab] = useState('stats');
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ displayName: '', bio: '', avatar: 'a1', country: 'TW' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, h, a] = await Promise.all([
        api<{ stats: Stats }>('/me/stats'),
        api<{ hands: Hand[] }>('/me/hands'),
        api<{ achievements: any[] }>('/me/achievements'),
      ]);
      setStats(s.stats || {});
      setHands(h.hands || []);
      setAchievements(a.achievements || []);
    } catch (err: any) {
      toast.push(err?.message || '載入個人資料失敗', 'error');
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (user) {
      setForm({
        displayName: user.displayName || '',
        bio: user.bio || '',
        avatar: user.avatar || 'a1',
        country: user.country || 'TW',
      });
    }
  }, [user]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await api<{ user: any }>('/me', { method: 'PATCH', body: form });
      if (res.user) setUser(res.user);
      toast.push('個人資料已更新', 'success');
      setEditOpen(false);
    } catch (err: any) {
      toast.push(err?.message || '更新失敗', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  const xpPct = user.xpNext && user.xpNext > (user.xpCurrent || 0)
    ? Math.min(100, Math.round((((user.xp || 0) - (user.xpCurrent || 0)) / (user.xpNext - (user.xpCurrent || 0))) * 100))
    : 0;
  const unlocked = achievements.filter((a) => a.unlocked).length;

  return (
    <main className="page">
      <div className="page-head">
        <h1>個人中心</h1>
        <button className="icon-btn" onClick={() => navigate('/settings')} aria-label="設定">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.7 1.7 0 007 19.4a1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1A1.7 1.7 0 004.6 7a1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V1a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
          </svg>
        </button>
      </div>

      <section className="card profile-hero">
        <div className="profile-top">
          <Avatar id={user.avatar} name={user.displayName} size={72} level={user.level} />
          <div className="grow">
            <h2>
              {user.displayName}
              {user.isGuest ? <span className="pill">遊客</span> : null}
            </h2>
            <div className="t-sub">@{user.username || 'guest'} · Lv.{user.level}</div>
            <div className="xp-bar">
              <i style={{ width: `${xpPct}%` }} />
            </div>
            <div className="t-sub small">
              EXP {(user.xp || 0) - (user.xpCurrent || 0)} / {(user.xpNext || 0) - (user.xpCurrent || 0)}
            </div>
          </div>
        </div>
        {user.bio ? <p className="bio">{user.bio}</p> : null}
        <div className="wallet-row">
          <div>
            <span>免費遊戲積分</span>
            <b>{fmtFull(user.chips || 0)}</b>
          </div>
          <div>
            <span>加入日期</span>
            <b className="sm">{dateText(user.createdAt)}</b>
          </div>
        </div>
        <div className="club-actions">
          <button className="btn gold grow" onClick={() => setEditOpen(true)}>
            編輯資料
          </button>
          <button className="btn ghost" onClick={() => navigate('/missions')}>
            任務
          </button>
          <button className="btn ghost" onClick={() => navigate('/leaderboard')}>
            排行榜
          </button>
        </div>
      </section>

      <div className="stat-grid">
        <Stat label="參與局數" value={fmt(stats.handsPlayed || 0)} />
        <Stat label="勝場" value={fmt(stats.handsWon || 0)} />
        <Stat label="勝率" value={`${stats.winRate || 0}%`} />
        <Stat label="最大底池" value={fmt(stats.biggestPot || 0)} />
      </div>

      <div className="scroll-x filters">
        {[
          { v: 'stats', l: '牌型紀錄' },
          { v: 'history', l: `遊戲紀錄 ${hands.length}` },
          { v: 'achievements', l: `成就 ${unlocked}/${achievements.length}` },
        ].map((t) => (
          <button key={t.v} className={`chip ${tab === t.v ? 'active' : ''}`} onClick={() => setTab(t.v)}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'stats' ? (
        <section className="card">
          <div className="list">
            {(stats.handTypes || []).map((count: number, idx: number) =>
              count > 0 ? (
                <div className="tile" key={idx}>
                  <div className="t-main">
                    <div className="t-title">{HAND_LABEL[idx] || `牌型 ${idx}`}</div>
                    <div className="t-sub">累積次數</div>
                  </div>
                  <div className="t-side">
                    <b>{fmt(count)}</b>
                  </div>
                </div>
              ) : null,
            )}
            {(stats.handTypes || []).every((c: number) => !c) ? (
              <div className="empty">還沒有牌型紀錄，快去牌桌試試手氣</div>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab === 'history' ? (
        <section className="card">
          <div className="list">
            {hands.map((h) => {
              const win = (h.winners || []).some((w) => w.userId === user.id);
              return (
                <div className="tile" key={h.id}>
                  <div className={`history-icon ${win ? 'win' : ''}`}>{win ? 'W' : 'L'}</div>
                  <div className="t-main">
                    <div className="t-title">{h.tableName || '牌桌'}</div>
                    <div className="t-sub">
                      底池 {fmt(h.pot || 0)} · {dateText(h.createdAt || 0)}
                    </div>
                  </div>
                  <div className="t-side">
                    <b className={win ? 'pos' : 'neg'}>
                      {win ? `+${fmt((h.winners || []).find((w) => w.userId === user.id)?.amount || 0)}` : `-${fmt(h.myBet || 0)}`}
                    </b>
                  </div>
                </div>
              );
            })}
            {hands.length === 0 ? <div className="empty">還沒有遊戲紀錄</div> : null}
          </div>
        </section>
      ) : null}

      {tab === 'achievements' ? (
        <section className="card">
          <div className="list">
            {achievements.map((a) => (
              <div className={`tile ${a.unlocked ? '' : 'locked'}`} key={a.id}>
                <div className={`ach-icon ${a.unlocked ? 'on' : ''}`}>{a.unlocked ? '★' : '☆'}</div>
                <div className="t-main">
                  <div className="t-title">{a.title}</div>
                  <div className="t-sub">{a.desc}</div>
                </div>
                <div className="t-side">
                  {a.unlocked ? <span className="pill green">已達成</span> : <span className="pill">未達成</span>}
                </div>
              </div>
            ))}
            {achievements.length === 0 ? <div className="empty">尚無成就資料</div> : null}
          </div>
        </section>
      ) : null}

      <button className="btn ghost block" style={{ marginTop: 16 }} onClick={async () => { await logout(); navigate('/auth'); }}>
        登出
      </button>

      {editOpen ? (
        <Sheet
          title="編輯個人資料"
          onClose={() => setEditOpen(false)}
          footer={
            <button className="btn gold block lg" onClick={save} disabled={busy || form.displayName.trim().length < 2}>
              儲存
            </button>
          }
        >
          <label className="field">
            <span>暱稱</span>
            <input
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              maxLength={16}
              placeholder="2-16 個字元"
            />
          </label>
          <label className="field">
            <span>自我介紹</span>
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              rows={3}
              maxLength={120}
              placeholder="分享你的牌風或喜歡的玩法"
            />
          </label>
          <div className="field">
            <span>頭像</span>
            <div className="avatar-picker">
              {(AVATAR_OPTIONS as string[]).map((id) => (
                <button
                  key={id}
                  className={`avatar-choice ${form.avatar === id ? 'active' : ''}`}
                  onClick={() => setForm({ ...form, avatar: id })}
                >
                  <Avatar id={id} size={44} />
                </button>
              ))}
            </div>
          </div>
        </Sheet>
      ) : null}
    </main>
  );
}
