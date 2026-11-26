import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { fmt, timeAgo } from '../lib/format';
import { useAuth } from '../state/auth';
import { Avatar } from '../components/Avatar';
import { Segmented, useToast } from '../components/ui';

type Card = {
  relationId: string;
  userId: string;
  name: string;
  avatar: string;
  level: number;
  chips: number;
  online: boolean;
  handsWon: number;
  status: string;
  createdAt: number;
};

type Player = {
  userId: string;
  name: string;
  avatar: string;
  level: number;
  online: boolean;
  relation: string | null;
  relationId: string | null;
};

export default function Friends() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [tab, setTab] = useState('friends');
  const [friends, setFriends] = useState<Card[]>([]);
  const [incoming, setIncoming] = useState<Card[]>([]);
  const [outgoing, setOutgoing] = useState<Card[]>([]);
  const [blocked, setBlocked] = useState<Card[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api<{
        friends: Card[];
        incoming: Card[];
        outgoing: Card[];
        blocked: Card[];
      }>('/friends');
      setFriends(res.friends || []);
      setIncoming(res.incoming || []);
      setOutgoing(res.outgoing || []);
      setBlocked(res.blocked || []);
    } catch (err: any) {
      toast.push(err?.message || '載入好友失敗', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab !== 'search') return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api<{ players: Player[] }>(`/friends/search?q=${encodeURIComponent(q)}`);
        setResults(res.players || []);
      } catch {
        setResults([]);
      }
    }, 320);
    return () => clearTimeout(t);
  }, [query, tab]);

  const request = async (userId: string) => {
    try {
      await api('/friends/request', { method: 'POST', body: { userId } });
      toast.push('好友邀請已送出', 'success');
      load();
      setResults((prev) =>
        prev.map((p) => (p.userId === userId ? { ...p, relation: 'pending' } : p)),
      );
    } catch (err: any) {
      toast.push(err?.message || '邀請失敗', 'error');
    }
  };

  const accept = async (relId: string) => {
    try {
      await api('/friends/accept', { method: 'POST', body: { id: relId } });
      toast.push('已成為好友', 'success');
      load();
    } catch (err: any) {
      toast.push(err?.message || '操作失敗', 'error');
    }
  };

  const decline = async (relId: string) => {
    try {
      await api('/friends/decline', { method: 'POST', body: { id: relId } });
      load();
    } catch (err: any) {
      toast.push(err?.message || '操作失敗', 'error');
    }
  };

  const block = async (userId: string) => {
    try {
      await api('/friends/block', { method: 'POST', body: { userId } });
      toast.push('已封鎖該玩家', 'info');
      load();
    } catch (err: any) {
      toast.push(err?.message || '操作失敗', 'error');
    }
  };

  const remove = async (relId: string) => {
    try {
      await api(`/friends/${relId}`, { method: 'DELETE' });
      toast.push('已移除好友', 'info');
      load();
    } catch (err: any) {
      toast.push(err?.message || '操作失敗', 'error');
    }
  };

  const invite = async (userId: string) => {
    try {
      await api('/friends/invite', { method: 'POST', body: { userId } });
      toast.push('已送出邀請通知', 'success');
    } catch (err: any) {
      toast.push(err?.message || '邀請失敗', 'error');
    }
  };

  const relationLabel = (r: string | null) => {
    if (r === 'accepted') return '已是好友';
    if (r === 'pending') return '邀請中';
    if (r === 'blocked') return '已封鎖';
    return null;
  };

  return (
    <main className="page">
      <div className="page-head">
        <h1>好友</h1>
        <span className="pill">{friends.length} 位好友</span>
      </div>

      <Segmented
        options={[
          { value: 'friends', label: `好友 ${friends.length}` },
          { value: 'requests', label: `邀請 ${incoming.length}` },
          { value: 'search', label: '搜尋玩家' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {loading ? (
        <div className="empty">載入中…</div>
      ) : tab === 'friends' ? (
        <div className="list" style={{ marginTop: 12 }}>
          {friends.map((f) => (
            <div className="tile" key={f.relationId}>
              <Avatar id={f.avatar} name={f.name} size={40} level={f.level} />
              <div className="t-main">
                <div className="t-title">
                  {f.name}
                  <i className={`online-dot ${f.online ? 'on' : ''}`} />
                </div>
                <div className="t-sub">
                  Lv.{f.level} · 勝場 {fmt(f.handsWon)} · {f.online ? '在線' : timeAgo(f.createdAt)}
                </div>
              </div>
              <div className="t-side member-actions">
                <button className="btn sm ghost" onClick={() => navigate(`/players/${f.userId}`)}>
                  資料
                </button>
                <button className="btn sm gold" onClick={() => invite(f.userId)}>
                  邀請
                </button>
                <button className="btn sm danger" onClick={() => remove(f.relationId)}>
                  刪除
                </button>
              </div>
            </div>
          ))}
          {friends.length === 0 ? (
            <div className="empty">
              還沒有好友，去「搜尋玩家」找人一起打牌
              <div style={{ marginTop: 12 }}>
                <button className="btn gold" onClick={() => setTab('search')}>
                  搜尋玩家
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : tab === 'requests' ? (
        <div className="list" style={{ marginTop: 12 }}>
          {incoming.map((f) => (
            <div className="tile" key={f.relationId}>
              <Avatar id={f.avatar} name={f.name} size={40} />
              <div className="t-main">
                <div className="t-title">{f.name}</div>
                <div className="t-sub">想加你為好友 · {timeAgo(f.createdAt)}</div>
              </div>
              <div className="t-side member-actions">
                <button className="btn sm gold" onClick={() => accept(f.relationId)}>
                  接受
                </button>
                <button className="btn sm ghost" onClick={() => decline(f.relationId)}>
                  拒絕
                </button>
              </div>
            </div>
          ))}
          {outgoing.length > 0 ? (
            <div className="section-label">已送出邀請</div>
          ) : null}
          {outgoing.map((f) => (
            <div className="tile" key={f.relationId}>
              <Avatar id={f.avatar} name={f.name} size={40} />
              <div className="t-main">
                <div className="t-title">{f.name}</div>
                <div className="t-sub">等待對方回覆</div>
              </div>
              <div className="t-side">
                <button className="btn sm ghost" onClick={() => decline(f.relationId)}>
                  取消
                </button>
              </div>
            </div>
          ))}
          {incoming.length === 0 && outgoing.length === 0 ? (
            <div className="empty">沒有待處理的好友邀請</div>
          ) : null}
          {blocked.length > 0 ? (
            <>
              <div className="section-label">已封鎖</div>
              {blocked.map((f) => (
                <div className="tile" key={f.relationId}>
                  <Avatar id={f.avatar} name={f.name} size={40} />
                  <div className="t-main">
                    <div className="t-title">{f.name}</div>
                    <div className="t-sub">已封鎖</div>
                  </div>
                  <div className="t-side">
                    <button className="btn sm ghost" onClick={() => remove(f.relationId)}>
                      解除
                    </button>
                  </div>
                </div>
              ))}
            </>
          ) : null}
        </div>
      ) : (
        <>
          <div className="search-box">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="輸入暱稱搜尋玩家"
              maxLength={24}
            />
          </div>
          <div className="list">
            {results.map((p) => (
              <div className="tile" key={p.userId}>
                <Avatar id={p.avatar} name={p.name} size={40} level={p.level} />
                <div className="t-main">
                  <div className="t-title">
                    {p.name}
                    <i className={`online-dot ${p.online ? 'on' : ''}`} />
                  </div>
                  <div className="t-sub">Lv.{p.level} · {p.online ? '在線' : '離線'}</div>
                </div>
                <div className="t-side member-actions">
                  <button className="btn sm ghost" onClick={() => navigate(`/players/${p.userId}`)}>
                    資料
                  </button>
                  {p.relation === 'accepted' ? (
                    <span className="pill green">好友</span>
                  ) : p.relation === 'pending' ? (
                    <span className="pill">邀請中</span>
                  ) : (
                    <button className="btn sm gold" onClick={() => request(p.userId)}>
                      加好友
                    </button>
                  )}
                  <button className="btn sm ghost" onClick={() => block(p.userId)}>
                    封鎖
                  </button>
                </div>
              </div>
            ))}
            {query.trim() && results.length === 0 ? <div className="empty">找不到符合的玩家</div> : null}
            {!query.trim() ? <div className="empty">輸入暱稱即可搜尋全服玩家</div> : null}
          </div>
        </>
      )}

      {user ? (
        <p className="hint">提示：好友邀請與牌桌邀請會即時出現在通知中心。</p>
      ) : null}
    </main>
  );
}
