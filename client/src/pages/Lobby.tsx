import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { fmt, clockText } from '../lib/format';
import { useAuth } from '../state/auth';
import { Avatar } from '../components/Avatar';
import { Progress, useToast } from '../components/ui';
import { TableEmblem } from '../components/Logo';

type Mission = {
  id: string;
  title: string;
  desc: string;
  target: number;
  progress: number;
  chips: number;
  xp: number;
  claimed?: boolean;
  done: boolean;
};

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
  status: string;
  hot?: boolean;
};

const BANNERS = [
  {
    title: '金冠週末賽',
    sub: '冠軍獨得 30,000 積分',
    tag: '本週主打',
    action: '/tournaments',
    cta: '查看賽事',
    className: 'b-gold',
  },
  {
    title: '新手友善桌',
    sub: '低盲注、完整教學提示',
    tag: '新手專區',
    action: '/tables',
    cta: '立即前往',
    className: 'b-green',
  },
  {
    title: '俱樂部榮耀榜',
    sub: '與隊友一起衝上排名',
    tag: '社群',
    action: '/clubs',
    cta: '加入俱樂部',
    className: 'b-navy',
  },
];

const QUICK = [
  { to: '/tables', label: '公開牌桌', icon: 'M3 7h18v10H3Zm3 13h12M8 7V5h8v2' },
  { to: '/rooms', label: '私人房間', icon: 'M4 10h16v10H4Zm3 0V7a5 5 0 0 1 10 0v3' },
  { to: '/tournaments', label: '錦標賽', icon: 'M8 4h8v4a4 4 0 0 1-8 0Zm4 8v5m-4 3h8' },
  { to: '/clubs', label: '俱樂部', icon: 'M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm-7 18a7 7 0 0 1 14 0' },
  { to: '/friends', label: '好友', icon: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7 0a3 3 0 1 0 0-6M2 20a7 7 0 0 1 14 0Zm14 0a6 6 0 0 1 6-6' },
  { to: '/leaderboard', label: '排行榜', icon: 'M5 20V10m7 10V4m7 16v-7' },
  { to: '/missions', label: '任務活動', icon: 'M9 11l3 3 6-6M4 5h16v16H4Z' },
  { to: '/profile', label: '個人中心', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0' },
];

export default function Lobby() {
  const { user, applyWallet } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [slide, setSlide] = useState(0);
  const [busy, setBusy] = useState(false);
  const [claimInfo, setClaimInfo] = useState<{ streak: number; claimed: boolean }>({
    streak: user?.daily?.streak || 0,
    claimed: false,
  });

  const load = useCallback(async () => {
    try {
      const [me, t, tour, ann] = await Promise.all([
        api<{ missions: Mission[] }>('/me'),
        api<{ tables: TableInfo[] }>('/tables'),
        api<{ tournaments: any[] }>('/tournaments'),
        api<{ announcements: any[] }>('/announcements'),
      ]);
      setMissions(me.missions || []);
      setTables(t.tables || []);
      setTournaments(tour.tournaments || []);
      setAnnouncements(ann.announcements || []);
    } catch (err: any) {
      toast.push(err?.message || '載入大廳資料失敗', 'error');
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % BANNERS.length), 5200);
    return () => clearInterval(id);
  }, []);

  const hotTables = useMemo(
    () => [...tables].sort((a, b) => b.humans - a.humans || b.players - a.players).slice(0, 4),
    [tables],
  );
  const featured = useMemo(
    () =>
      [...tournaments]
        .filter((t) => t.status !== 'finished')
        .sort((a, b) => (a.startsAt || 0) - (b.startsAt || 0))
        .slice(0, 3),
    [tournaments],
  );
  const dailyMissions = useMemo(() => missions.slice(0, 3), [missions]);
  const unclaimed = missions.filter((m) => m.done && !m.claimed).length;

  const claimDaily = async () => {
    setBusy(true);
    try {
      const res = await api<{ reward: number; streak: number; user: any }>('/me/daily', { method: 'POST' });
      applyWallet(res.user.chips);
      setClaimInfo({ streak: res.streak, claimed: true });
      toast.push(`領取成功 +${fmt(res.reward)} 積分（連續 ${res.streak} 天）`, 'success');
    } catch (err: any) {
      toast.push(err?.message || '領取失敗', 'error');
    } finally {
      setBusy(false);
    }
  };

  const quickStart = async () => {
    setBusy(true);
    try {
      const res = await api<{ tableId: string }>('/tables/quick', { method: 'POST', body: {} });
      navigate(`/table/${res.tableId}`);
    } catch (err: any) {
      toast.push(err?.message || '找不到適合的牌桌', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;
  const xpSpan = Math.max(1, user.xpNext - user.xpCurrent);
  const xpIn = Math.max(0, user.xp - user.xpCurrent);

  return (
    <main className="page">
      <section className="hero">
        <div className="hero-row">
          <Avatar id={user.avatar} name={user.displayName} size={54} level={user.level} ring />
          <div className="grow">
            <div className="hero-name">
              歡迎回來，{user.displayName}
              {user.isGuest ? <span className="tag-mini">遊客</span> : null}
            </div>
            <div className="hero-meta">
              Lv.{user.level} · 經驗 {xpIn}/{xpSpan}
            </div>
            <Progress value={xpIn} total={xpSpan} />
          </div>
        </div>
        <div className="hero-stats">
          <div>
            <span>遊戲積分</span>
            <b>
              <i className="chip-icon" /> {fmt(user.chips)}
            </b>
          </div>
          <div>
            <span>勝場</span>
            <b>{fmt(user.stats?.handsWon || 0)}</b>
          </div>
          <div>
            <span>參與局數</span>
            <b>{fmt(user.stats?.handsPlayed || 0)}</b>
          </div>
        </div>
        <div className="hero-actions">
          <button className="btn gold lg grow" onClick={quickStart} disabled={busy}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5.5v13l11-6.5Z" />
            </svg>
            快速開始
          </button>
          <button className="btn outline" onClick={() => navigate('/tables')}>
            選擇牌桌
          </button>
        </div>
      </section>

      <section className="banner-carousel" aria-label="活動 Banner">
        <div className="banner-track" style={{ transform: `translateX(-${slide * 100}%)` }}>
          {BANNERS.map((b) => (
            <div className={`banner ${b.className}`} key={b.title}>
              <div className="banner-emblem">
                <TableEmblem size={92} />
              </div>
              <span className="banner-tag">{b.tag}</span>
              <h2>{b.title}</h2>
              <p>{b.sub}</p>
              <Link className="btn gold sm" to={b.action}>
                {b.cta}
              </Link>
            </div>
          ))}
        </div>
        <div className="banner-dots">
          {BANNERS.map((b, i) => (
            <button
              key={b.title}
              className={i === slide ? 'active' : ''}
              onClick={() => setSlide(i)}
              aria-label={`第 ${i + 1} 張`}
            />
          ))}
        </div>
      </section>

      <section className="quick-grid">
        {QUICK.map((q) => (
          <button key={q.to} className="quick-item" onClick={() => navigate(q.to)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d={q.icon} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{q.label}</span>
          </button>
        ))}
      </section>

      <section className="card">
        <div className="card-head">
          <h3>每日登入獎勵</h3>
          <span className="muted">連續 {claimInfo.streak} 天</span>
        </div>
        <div className="reward-days">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <div
              key={d}
              className={`reward-day ${d <= claimInfo.streak ? 'done' : ''} ${
                d === Math.min(7, claimInfo.streak + (claimInfo.claimed ? 0 : 1)) && !claimInfo.claimed ? 'today' : ''
              }`}
            >
              <span>D{d}</span>
              <b>{fmt(1000 + (d - 1) * 400)}</b>
            </div>
          ))}
        </div>
        <button className="btn gold block" onClick={claimDaily} disabled={busy || claimInfo.claimed}>
          {claimInfo.claimed ? '今日已領取' : '領取今日獎勵'}
        </button>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>每日任務</h3>
          <Link className="link" to="/missions">
            全部 {unclaimed > 0 ? `· ${unclaimed} 可領取` : ''}
          </Link>
        </div>
        <div className="list">
          {dailyMissions.map((m) => (
            <div className="tile" key={m.id}>
              <div className="t-main">
                <div className="t-title">{m.title}</div>
                <div className="t-sub">{m.desc}</div>
                <Progress value={m.progress} total={m.target} green={m.done} />
              </div>
              <div className="t-side">
                <span className={m.done ? 'pill green' : 'pill'}>
                  {Math.min(m.progress, m.target)}/{m.target}
                </span>
              </div>
            </div>
          ))}
          {dailyMissions.length === 0 ? <div className="empty">尚無任務</div> : null}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>熱門房間</h3>
          <Link className="link" to="/tables">
            查看全部
          </Link>
        </div>
        <div className="list">
          {hotTables.map((t) => (
            <button key={t.id} className="tile clickable" onClick={() => navigate(`/table/${t.id}`)}>
              <div className="table-thumb">
                <TableEmblem size={30} />
              </div>
              <div className="t-main">
                <div className="t-title">
                  {t.name} {t.hot ? <span className="pill gold">熱門</span> : null}
                </div>
                <div className="t-sub">
                  盲注 {t.smallBlind}/{t.bigBlind} · {t.players}/{t.maxPlayers} 人 ·{' '}
                  {t.humans > 0 ? `${t.humans} 位真人` : 'AI 牌友'}
                </div>
              </div>
              <div className="t-side">
                <span className="btn sm gold">加入</span>
              </div>
            </button>
          ))}
          {hotTables.length === 0 ? <div className="empty">目前沒有開放牌桌</div> : null}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>推薦賽事</h3>
          <Link className="link" to="/tournaments">
            賽事中心
          </Link>
        </div>
        <div className="list">
          {featured.map((t) => (
            <button
              key={t.id}
              className="tile clickable"
              onClick={() => navigate(`/tournaments/${t.id}`)}
            >
              <div className="t-main">
                <div className="t-title">{t.name}</div>
                <div className="t-sub">
                  {t.typeLabel || t.type} · 買入 {fmt(t.buyIn || 0)} · 開賽 {clockText(t.startsAt)}
                </div>
              </div>
              <div className="t-side">
                <span className="pill">{t.registered ?? 0} 人報名</span>
              </div>
            </button>
          ))}
          {featured.length === 0 ? <div className="empty">暫無賽事</div> : null}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>遊戲公告</h3>
        </div>
        <div className="list">
          {announcements.map((a) => (
            <div className="tile" key={a.id}>
              <div className="t-main">
                <div className="t-title">
                  <span className="pill">{a.tag}</span> {a.title}
                </div>
                <div className="t-sub">{a.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
