import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { fmt, fmtFull, dateText, RANK_LABEL } from '../lib/format';
import { useAuth } from '../state/auth';
import { Avatar } from '../components/Avatar';
import { Stat, useToast } from '../components/ui';

type Player = {
  id: string;
  displayName: string;
  avatar: string;
  level: number;
  xp?: number;
  chips: number;
  bio?: string;
  country?: string;
  createdAt?: number;
  online?: boolean;
  rank?: string | number;
  relation?: string | null;
  relationId?: string | null;
  stats?: any;
};

export default function PlayerProfile() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [player, setPlayer] = useState<Player | null>(null);
  const [hands, setHands] = useState<any[]>([]);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ player: Player; hands: any[] }>(`/players/${id}`);
      setPlayer(res.player);
      setHands(res.hands || []);
    } catch (err: any) {
      setNotFound(true);
      toast.push(err?.message || '找不到玩家', 'error');
    }
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const addFriend = async () => {
    try {
      await api('/friends/request', { method: 'POST', body: { userId: id } });
      toast.push('好友邀請已送出', 'success');
      load();
    } catch (err: any) {
      toast.push(err?.message || '邀請失敗', 'error');
    }
  };

  const invite = async () => {
    try {
      await api('/friends/invite', { method: 'POST', body: { userId: id } });
      toast.push('已送出邀請通知', 'success');
    } catch (err: any) {
      toast.push(err?.message || '邀請失敗', 'error');
    }
  };

  if (notFound) {
    return (
      <main className="page">
        <div className="page-head">
          <button className="icon-btn" onClick={() => navigate(-1)} aria-label="返回">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1>玩家資料</h1>
        </div>
        <div className="empty">找不到這位玩家</div>
      </main>
    );
  }

  if (!player) {
    return (
      <main className="page">
        <div className="empty">載入中…</div>
      </main>
    );
  }

  const st = player.stats || {};
  const isMe = user?.id === player.id;
  const relation = player.relation;
  const winRate = st.handsPlayed ? Math.round((st.handsWon / st.handsPlayed) * 100) : 0;

  return (
    <main className="page">
      <div className="page-head">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="返回">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1>玩家資料</h1>
      </div>

      <section className="card profile-hero">
        <div className="profile-top">
          <Avatar id={player.avatar} name={player.displayName} size={72} level={player.level} />
          <div className="grow">
            <h2>
              {player.displayName}
              {player.online ? <i className="online-dot on" /> : null}
            </h2>
            <div className="t-sub">
              Lv.{player.level} · {typeof player.rank === 'string' ? player.rank : `排名 #${player.rank ?? '-'}`}
            </div>
            <div className="chip-badges">
              <span className="pill gold">積分 {fmt(player.chips || 0)}</span>
              {player.country ? <span className="pill">{player.country}</span> : null}
              {player.online ? <span className="pill green">在線</span> : <span className="pill">離線</span>}
            </div>
          </div>
        </div>
        {player.bio ? <p className="bio">{player.bio}</p> : null}
        {player.createdAt ? <div className="t-sub small">加入於 {dateText(player.createdAt)}</div> : null}
        {!isMe ? (
          <div className="club-actions">
            {relation === 'accepted' ? (
              <>
                <span className="pill green">已是好友</span>
                <button className="btn gold grow" onClick={invite}>
                  邀請一起玩
                </button>
              </>
            ) : relation === 'pending' ? (
              <span className="pill">好友邀請已送出</span>
            ) : (
              <button className="btn gold grow" onClick={addFriend}>
                加為好友
              </button>
            )}
          </div>
        ) : (
          <div className="club-actions">
            <button className="btn gold grow" onClick={() => navigate('/profile')}>
              前往個人中心
            </button>
          </div>
        )}
      </section>

      <div className="stat-grid">
        <Stat label="參與局數" value={fmt(st.handsPlayed || 0)} />
        <Stat label="勝場" value={fmt(st.handsWon || 0)} />
        <Stat label="勝率" value={`${winRate}%`} />
        <Stat label="積分" value={fmtFull(player.chips || 0)} />
      </div>

      <section className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          最近牌局
        </div>
        <div className="list">
          {hands.slice(0, 12).map((h: any) => {
            const win = (h.winners || []).some((w: any) => w.userId === player.id);
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
                  <b className={win ? 'pos' : 'neg'}>{win ? '勝' : '負'}</b>
                </div>
              </div>
            );
          })}
          {hands.length === 0 ? <div className="empty">尚無公開牌局紀錄</div> : null}
        </div>
      </section>
    </main>
  );
}
