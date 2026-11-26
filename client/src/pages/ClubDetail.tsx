import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { fmt, dateText } from '../lib/format';
import { useAuth } from '../state/auth';
import { connectSocket } from '../lib/socket';
import { Avatar } from '../components/Avatar';
import { Sheet, useToast } from '../components/ui';
import { LogoMark } from '../components/Logo';

type Member = {
  userId: string;
  role: string;
  joinedAt: number;
  name: string;
  avatar: string;
  level: number;
  chips: number;
  online: boolean;
  handsWon: number;
};

type Club = {
  id: string;
  name: string;
  description: string;
  announcement?: string;
  joinMode: string;
  ownerId: string;
  createdAt: number;
};

type ClubTable = {
  id: string;
  name: string;
  players: number;
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
};

type Msg = { userId: string | null; name: string; avatar: string; text: string; kind: string };

const ROLE_LABEL: Record<string, string> = {
  founder: '創辦人',
  admin: '管理員',
  officer: '幹部',
  member: '會員',
};

export default function ClubDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const socket = useMemo(() => connectSocket(), []);
  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [tables, setTables] = useState<ClubTable[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [chatText, setChatText] = useState('');
  const [tab, setTab] = useState('members');
  const [annOpen, setAnnOpen] = useState(false);
  const [annText, setAnnText] = useState('');
  const [tableOpen, setTableOpen] = useState(false);
  const [newTable, setNewTable] = useState({ name: '', maxPlayers: 6, smallBlind: 10, bigBlind: 20 });
  const [busy, setBusy] = useState(false);

  const canManage = myRole === 'founder' || myRole === 'admin';
  const canPost = canManage || myRole === 'officer';

  const load = useCallback(async () => {
    try {
      const res = await api<{
        club: Club;
        members: Member[];
        tables: ClubTable[];
        myRole: string | null;
        messages: Msg[];
      }>(`/clubs/${id}`);
      setClub(res.club);
      setMembers(res.members || []);
      setTables(res.tables || []);
      setMyRole(res.myRole);
      setMessages(res.messages || []);
    } catch (err: any) {
      toast.push(err?.message || '載入俱樂部失敗', 'error');
    }
  }, [id, toast]);

  useEffect(() => {
    load();
    const onChat = (m: Msg) => setMessages((prev) => [...prev.slice(-60), m]);
    const onHistory = ({ messages: list }: { messages: Msg[] }) => setMessages(list || []);
    socket.on('club:chat', onChat);
    socket.on('club:chat:history', onHistory);
    socket.emit('club:subscribe', { clubId: id });
    return () => {
      socket.off('club:chat', onChat);
      socket.off('club:chat:history', onHistory);
    };
  }, [id, socket, load]);

  const join = async () => {
    setBusy(true);
    try {
      await api(`/clubs/${id}/join`, { method: 'POST', body: {} });
      toast.push('已加入俱樂部', 'success');
      load();
    } catch (err: any) {
      toast.push(err?.message || '加入失敗', 'error');
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    setBusy(true);
    try {
      await api(`/clubs/${id}/leave`, { method: 'POST', body: {} });
      toast.push('已退出俱樂部', 'info');
      load();
    } catch (err: any) {
      toast.push(err?.message || '退出失敗', 'error');
    } finally {
      setBusy(false);
    }
  };

  const postAnnouncement = async () => {
    setBusy(true);
    try {
      await api(`/clubs/${id}/announcement`, { method: 'POST', body: { text: annText } });
      toast.push('公告已更新', 'success');
      setAnnOpen(false);
      load();
    } catch (err: any) {
      toast.push(err?.message || '發布失敗', 'error');
    } finally {
      setBusy(false);
    }
  };

  const setRole = async (memberId: string, role: string) => {
    try {
      await api(`/clubs/${id}/role`, { method: 'POST', body: { userId: memberId, role } });
      toast.push('職位已更新', 'success');
      load();
    } catch (err: any) {
      toast.push(err?.message || '更新失敗', 'error');
    }
  };

  const kick = async (memberId: string) => {
    try {
      await api(`/clubs/${id}/members/${memberId}`, { method: 'DELETE' });
      toast.push('已移除會員', 'info');
      load();
    } catch (err: any) {
      toast.push(err?.message || '移除失敗', 'error');
    }
  };

  const createTable = async () => {
    setBusy(true);
    try {
      const res = await api<{ tableId?: string; table?: ClubTable }>(`/clubs/${id}/tables`, {
        method: 'POST',
        body: newTable,
      });
      setTableOpen(false);
      const tid = res.tableId || res.table?.id;
      if (tid) navigate(`/table/${tid}`);
      else load();
    } catch (err: any) {
      toast.push(err?.message || '建立牌桌失敗', 'error');
    } finally {
      setBusy(false);
    }
  };

  const sendChat = () => {
    if (!chatText.trim()) return;
    socket.emit('club:chat', { clubId: id, text: chatText.trim() });
    setChatText('');
  };

  if (!club) {
    return (
      <main className="page">
        <div className="empty">載入中…</div>
      </main>
    );
  }

  const onlineCount = members.filter((m) => m.online).length;

  return (
    <main className="page">
      <div className="page-head">
        <button className="icon-btn" onClick={() => navigate('/clubs')} aria-label="返回">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 style={{ fontSize: 17 }}>{club.name}</h1>
      </div>

      <section className="card club-hero">
        <div className="club-hero-top">
          <div className="club-logo lg">
            <LogoMark size={44} />
          </div>
          <div className="grow">
            <h2>{club.name}</h2>
            <div className="t-sub">{club.description || '歡迎加入一起打牌'}</div>
            <div className="club-stats">
              <span>{members.length} 位成員</span>
              <span>{onlineCount} 人在線</span>
              {myRole ? <span className="pill gold">{ROLE_LABEL[myRole] || myRole}</span> : null}
            </div>
          </div>
        </div>
        {club.announcement ? (
          <div className="announcement">
            <b>俱樂部公告</b>
            <span>{club.announcement}</span>
          </div>
        ) : null}
        <div className="club-actions">
          {!myRole ? (
            <button className="btn gold grow" onClick={join} disabled={busy}>
              加入俱樂部
            </button>
          ) : (
            <>
              <button className="btn gold grow" onClick={() => setTableOpen(true)}>
                建立俱樂部牌桌
              </button>
              {canPost ? (
                <button className="btn ghost" onClick={() => setAnnOpen(true)}>
                  發布公告
                </button>
              ) : null}
              {myRole !== 'founder' ? (
                <button className="btn danger" onClick={leave} disabled={busy}>
                  退出
                </button>
              ) : null}
            </>
          )}
        </div>
      </section>

      <div className="scroll-x filters">
        {[
          { v: 'members', l: `會員 ${members.length}` },
          { v: 'tables', l: `牌桌 ${tables.length}` },
          { v: 'chat', l: '聊天' },
          { v: 'ranking', l: '俱樂部排行' },
        ].map((t) => (
          <button key={t.v} className={`chip ${tab === t.v ? 'active' : ''}`} onClick={() => setTab(t.v)}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'members' ? (
        <section className="card">
          <div className="list">
            {members.map((m) => (
              <div className="tile" key={m.userId}>
                <Avatar id={m.avatar} name={m.name} size={38} level={m.level} />
                <div className="t-main">
                  <div className="t-title">
                    {m.name}{' '}
                    <span className={`pill ${m.role === 'founder' ? 'gold' : ''}`}>
                      {ROLE_LABEL[m.role] || m.role}
                    </span>
                    {m.online ? <i className="online-dot" /> : null}
                  </div>
                  <div className="t-sub">
                    勝場 {fmt(m.handsWon)} · 加入 {dateText(m.joinedAt)}
                  </div>
                </div>
                <div className="t-side member-actions">
                  <button className="btn sm ghost" onClick={() => navigate(`/players/${m.userId}`)}>
                    資料
                  </button>
                  {canManage && m.role !== 'founder' && m.userId !== user?.id ? (
                    <>
                      <button
                        className="btn sm ghost"
                        onClick={() => setRole(m.userId, m.role === 'member' ? 'officer' : 'member')}
                      >
                        {m.role === 'member' ? '升幹部' : '降會員'}
                      </button>
                      <button className="btn sm danger" onClick={() => kick(m.userId)}>
                        移除
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === 'tables' ? (
        <section className="card">
          <div className="list">
            {tables.map((t) => (
              <button key={t.id} className="tile clickable" onClick={() => navigate(`/table/${t.id}`)}>
                <div className="t-main">
                  <div className="t-title">{t.name}</div>
                  <div className="t-sub">
                    盲注 {t.smallBlind}/{t.bigBlind} · {t.players}/{t.maxPlayers} 人
                  </div>
                </div>
                <div className="t-side">
                  <span className="btn sm gold">進入</span>
                </div>
              </button>
            ))}
            {tables.length === 0 ? <div className="empty">尚無俱樂部專屬牌桌</div> : null}
          </div>
        </section>
      ) : null}

      {tab === 'chat' ? (
        <section className="card">
          <div className="chat-list tall">
            {messages.map((m, i) => (
              <div key={i} className={`chat-line ${m.userId === user?.id ? 'mine' : ''}`}>
                <b>{m.name}</b>
                <span>{m.text}</span>
              </div>
            ))}
            {messages.length === 0 ? <div className="empty">俱樂部聊天室空空的</div> : null}
          </div>
          <div className="chat-input">
            <input
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendChat()}
              placeholder={myRole ? '輸入訊息…' : '加入俱樂部後才能聊天'}
              disabled={!myRole}
              maxLength={200}
            />
            <button className="btn gold sm" onClick={sendChat} disabled={!myRole}>
              送出
            </button>
          </div>
        </section>
      ) : null}

      {tab === 'ranking' ? (
        <section className="card">
          <div className="list">
            {[...members]
              .sort((a, b) => b.chips - a.chips)
              .map((m, i) => (
                <button key={m.userId} className="rank-row" onClick={() => navigate(`/players/${m.userId}`)}>
                  <span className={`rank-no ${i < 3 ? 'g' : ''}`}>{i + 1}</span>
                  <Avatar id={m.avatar} name={m.name} size={34} />
                  <div className="grow">
                    <div className="r-name">{m.name}</div>
                    <div className="t-sub">Lv.{m.level} · 勝場 {fmt(m.handsWon)}</div>
                  </div>
                  <div className="r-value">
                    <b>{fmt(m.chips)}</b>
                    <span>積分</span>
                  </div>
                </button>
              ))}
          </div>
        </section>
      ) : null}

      {annOpen ? (
        <Sheet
          title="發布俱樂部公告"
          onClose={() => setAnnOpen(false)}
          footer={
            <button className="btn gold block lg" onClick={postAnnouncement} disabled={busy || !annText.trim()}>
              發布公告
            </button>
          }
        >
          <label className="field">
            <span>公告內容</span>
            <textarea
              value={annText}
              onChange={(e) => setAnnText(e.target.value)}
              rows={4}
              maxLength={200}
              placeholder="例如：本週五 20:00 俱樂部例行賽"
            />
          </label>
        </Sheet>
      ) : null}

      {tableOpen ? (
        <Sheet
          title="建立俱樂部牌桌"
          onClose={() => setTableOpen(false)}
          footer={
            <button className="btn gold block lg" onClick={createTable} disabled={busy}>
              建立並進入
            </button>
          }
        >
          <label className="field">
            <span>牌桌名稱</span>
            <input
              value={newTable.name}
              onChange={(e) => setNewTable({ ...newTable, name: e.target.value })}
              placeholder={`${club.name} 專屬桌`}
              maxLength={24}
            />
          </label>
          <label className="field">
            <span>人數</span>
            <select
              value={newTable.maxPlayers}
              onChange={(e) => setNewTable({ ...newTable, maxPlayers: Number(e.target.value) })}
            >
              <option value={2}>2 人</option>
              <option value={6}>6 人</option>
              <option value={9}>9 人</option>
            </select>
          </label>
          <div className="field-row">
            <label className="field">
              <span>小盲</span>
              <input
                type="number"
                value={newTable.smallBlind}
                onChange={(e) => {
                  const sb = Number(e.target.value) || 1;
                  setNewTable({ ...newTable, smallBlind: sb, bigBlind: sb * 2 });
                }}
              />
            </label>
            <label className="field">
              <span>大盲</span>
              <input
                type="number"
                value={newTable.bigBlind}
                onChange={(e) => setNewTable({ ...newTable, bigBlind: Number(e.target.value) || 2 })}
              />
            </label>
          </div>
        </Sheet>
      ) : null}
    </main>
  );
}
