import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { fmt, dateText } from '../lib/format';
import { Avatar } from '../components/Avatar';
import { Sheet, useToast } from '../components/ui';
import { LogoMark } from '../components/Logo';

type Club = {
  id: string;
  name: string;
  description: string;
  announcement?: string;
  logo?: string;
  joinMode: string;
  ownerId: string;
  members: number;
  online: number;
  createdAt: number;
  myRole?: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  founder: '創辦人',
  admin: '管理員',
  officer: '幹部',
  member: '會員',
};

export default function Clubs() {
  const navigate = useNavigate();
  const toast = useToast();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    joinMode: 'open',
    announcement: '',
  });

  const load = useCallback(async () => {
    try {
      const res = await api<{ clubs: Club[] }>('/clubs');
      setClubs(res.clubs || []);
    } catch (err: any) {
      toast.push(err?.message || '載入俱樂部失敗', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const res = await api<{ club: Club }>('/clubs', { method: 'POST', body: form });
      toast.push('俱樂部已建立', 'success');
      setOpen(false);
      navigate(`/clubs/${res.club.id}`);
    } catch (err: any) {
      toast.push(err?.message || '建立失敗', 'error');
    } finally {
      setBusy(false);
    }
  };

  const mine = clubs.filter((c) => c.myRole);
  const discover = clubs.filter((c) => !c.myRole);

  return (
    <main className="page">
      <div className="page-head">
        <h1>俱樂部</h1>
        <button className="btn gold sm" onClick={() => setOpen(true)}>
          建立俱樂部
        </button>
      </div>

      {loading ? (
        <div className="empty">載入中…</div>
      ) : (
        <>
          <section className="card">
            <div className="card-head">
              <h3>我的俱樂部</h3>
              <span className="muted">{mine.length} 個</span>
            </div>
            <div className="list">
              {mine.map((c) => (
                <button key={c.id} className="tile clickable" onClick={() => navigate(`/clubs/${c.id}`)}>
                  <div className="club-logo">
                    <LogoMark size={34} />
                  </div>
                  <div className="t-main">
                    <div className="t-title">
                      {c.name} <span className="pill gold">{ROLE_LABEL[c.myRole || ''] || c.myRole}</span>
                    </div>
                    <div className="t-sub">
                      {c.members} 位成員 · {c.online} 人在線
                    </div>
                  </div>
                  <div className="t-side">
                    <span className="btn sm ghost">進入</span>
                  </div>
                </button>
              ))}
              {mine.length === 0 ? <div className="empty">你還沒有加入任何俱樂部</div> : null}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>探索俱樂部</h3>
            </div>
            <div className="list">
              {discover.map((c) => (
                <button key={c.id} className="tile clickable" onClick={() => navigate(`/clubs/${c.id}`)}>
                  <div className="club-logo">
                    <LogoMark size={34} />
                  </div>
                  <div className="t-main">
                    <div className="t-title">{c.name}</div>
                    <div className="t-sub">
                      {c.description || '歡迎加入一起打牌'} · {c.members} 人
                    </div>
                  </div>
                  <div className="t-side">
                    <span className="pill">{c.joinMode === 'open' ? '可直接加入' : '需審核'}</span>
                  </div>
                </button>
              ))}
              {discover.length === 0 ? <div className="empty">目前沒有其他俱樂部</div> : null}
            </div>
          </section>
        </>
      )}

      {open ? (
        <Sheet
          title="建立俱樂部"
          onClose={() => setOpen(false)}
          footer={
            <button className="btn gold block lg" onClick={create} disabled={busy || !form.name.trim()}>
              {busy ? '建立中…' : '建立俱樂部'}
            </button>
          }
        >
          <label className="field">
            <span>俱樂部名稱</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例如：皇家撲克會"
              maxLength={24}
            />
          </label>
          <label className="field">
            <span>簡介</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="介紹你的俱樂部風格與活動"
              maxLength={160}
              rows={3}
            />
          </label>
          <label className="field">
            <span>加入方式</span>
            <select value={form.joinMode} onChange={(e) => setForm({ ...form, joinMode: e.target.value })}>
              <option value="open">開放加入</option>
              <option value="approval">需要審核</option>
              <option value="invite">僅限邀請</option>
            </select>
          </label>
          <label className="field">
            <span>俱樂部公告</span>
            <textarea
              value={form.announcement}
              onChange={(e) => setForm({ ...form, announcement: e.target.value })}
              placeholder="每週五晚間俱樂部例行賽"
              maxLength={200}
              rows={2}
            />
          </label>
          <p className="hint">建立後你將成為創辦人，可管理會員、發布公告與建立專屬牌桌。</p>
        </Sheet>
      ) : null}
    </main>
  );
}
