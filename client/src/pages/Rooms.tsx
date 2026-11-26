import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { fmt } from '../lib/format';
import { Segmented, Sheet, useToast } from '../components/ui';

type Room = {
  id: string;
  name: string;
  code: string | null;
  maxPlayers: number;
  players: number;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  ownerId: string | null;
  status: string;
  private: boolean;
};

export default function Rooms() {
  const navigate = useNavigate();
  const toast = useToast();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    name: '',
    password: '',
    maxPlayers: 6,
    smallBlind: 10,
    bigBlind: 20,
    minBuyIn: 400,
    maxBuyIn: 2000,
    bots: true,
    actionTimeoutMs: 25000,
  });
  const [joinForm, setJoinForm] = useState({ code: '', password: '' });

  const load = useCallback(async () => {
    try {
      const res = await api<{ rooms: Room[] }>('/rooms');
      setRooms(res.rooms || []);
    } catch (err: any) {
      toast.push(err?.message || '載入房間失敗', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  const createRoom = async () => {
    setBusy(true);
    try {
      const res = await api<{ room: Room }>('/rooms', { method: 'POST', body: form });
      toast.push(`房間已建立，邀請碼 ${res.room.code}`, 'success');
      setCreateOpen(false);
      navigate(`/table/${res.room.id}`);
    } catch (err: any) {
      toast.push(err?.message || '建立房間失敗', 'error');
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = async () => {
    setBusy(true);
    try {
      const res = await api<{ tableId: string }>('/rooms/join', { method: 'POST', body: joinForm });
      setJoinOpen(false);
      navigate(`/table/${res.tableId}`);
    } catch (err: any) {
      toast.push(err?.message || '加入房間失敗', 'error');
    } finally {
      setBusy(false);
    }
  };

  const removeRoom = async (room: Room) => {
    try {
      await api(`/rooms/${room.id}`, { method: 'DELETE' });
      toast.push('房間已關閉', 'success');
      load();
    } catch (err: any) {
      toast.push(err?.message || '關閉房間失敗', 'error');
    }
  };

  return (
    <main className="page">
      <div className="page-head">
        <h1>私人房間</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost sm" onClick={() => setJoinOpen(true)}>
            邀請碼加入
          </button>
          <button className="btn gold sm" onClick={() => setCreateOpen(true)}>
            建立房間
          </button>
        </div>
      </div>

      <div className="notice-card">
        <b>專屬牌局，只邀好友</b>
        <span>自訂盲注、人數與密碼，分享邀請碼即可開局，房主可鎖定房間與移除玩家。</span>
      </div>

      {loading ? (
        <div className="empty">載入中…</div>
      ) : rooms.length === 0 ? (
        <div className="empty">
          <div style={{ marginBottom: 12 }}>你還沒有建立任何私人房間</div>
          <button className="btn gold" onClick={() => setCreateOpen(true)}>
            建立第一個房間
          </button>
        </div>
      ) : (
        <div className="list">
          {rooms.map((r) => (
            <article className="room-card" key={r.id}>
              <div className="room-top">
                <div>
                  <h3>{r.name}</h3>
                  <div className="t-sub">
                    盲注 {r.smallBlind}/{r.bigBlind} · {r.players}/{r.maxPlayers} 人
                  </div>
                </div>
                <div className="invite-code">
                  <span>邀請碼</span>
                  <b>{r.code}</b>
                </div>
              </div>
              <div className="room-actions">
                <button className="btn gold sm grow" onClick={() => navigate(`/table/${r.id}`)}>
                  進入房間
                </button>
                <button
                  className="btn ghost sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(r.code || '').then(
                      () => toast.push('邀請碼已複製', 'success'),
                      () => toast.push(`邀請碼：${r.code}`, 'info'),
                    );
                  }}
                >
                  分享
                </button>
                <button className="btn danger sm" onClick={() => removeRoom(r)}>
                  關閉
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {createOpen ? (
        <Sheet
          title="建立私人房間"
          onClose={() => setCreateOpen(false)}
          footer={
            <button className="btn gold block lg" onClick={createRoom} disabled={busy}>
              {busy ? '建立中…' : '建立並進入房間'}
            </button>
          }
        >
          <label className="field">
            <span>房間名稱</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例如：週五好友局"
              maxLength={24}
            />
          </label>
          <label className="field">
            <span>房間密碼（選填）</span>
            <input
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="設定後需輸入密碼加入"
              maxLength={20}
            />
          </label>
          <div className="field">
            <span>桌型</span>
            <Segmented
              options={[
                { value: 2, label: '2 人' },
                { value: 6, label: '6 人' },
                { value: 9, label: '9 人' },
              ]}
              value={form.maxPlayers}
              onChange={(v) => setForm({ ...form, maxPlayers: Number(v) })}
            />
          </div>
          <div className="field-row">
            <label className="field">
              <span>小盲</span>
              <input
                type="number"
                min={1}
                value={form.smallBlind}
                onChange={(e) => {
                  const sb = Math.max(1, Number(e.target.value) || 1);
                  setForm({ ...form, smallBlind: sb, bigBlind: sb * 2 });
                }}
              />
            </label>
            <label className="field">
              <span>大盲</span>
              <input
                type="number"
                min={2}
                value={form.bigBlind}
                onChange={(e) => setForm({ ...form, bigBlind: Math.max(2, Number(e.target.value) || 2) })}
              />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>最小買入</span>
              <input
                type="number"
                value={form.minBuyIn}
                onChange={(e) => setForm({ ...form, minBuyIn: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="field">
              <span>最大買入</span>
              <input
                type="number"
                value={form.maxBuyIn}
                onChange={(e) => setForm({ ...form, maxBuyIn: Number(e.target.value) || 0 })}
              />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>思考時間</span>
              <Segmented
                options={[
                  { value: 15000, label: '15 秒' },
                  { value: 25000, label: '25 秒' },
                  { value: 45000, label: '45 秒' },
                ]}
                value={form.actionTimeoutMs}
                onChange={(v) => setForm({ ...form, actionTimeoutMs: Number(v) })}
              />
            </label>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={form.bots}
              onChange={(e) => setForm({ ...form, bots: e.target.checked })}
            />
            <span>人數不足時由 AI 牌友補位（建議開啟）</span>
          </label>
        </Sheet>
      ) : null}

      {joinOpen ? (
        <Sheet
          title="以邀請碼加入"
          onClose={() => setJoinOpen(false)}
          footer={
            <button className="btn gold block lg" onClick={joinRoom} disabled={busy}>
              {busy ? '加入中…' : '加入房間'}
            </button>
          }
        >
          <label className="field">
            <span>邀請碼</span>
            <input
              value={joinForm.code}
              onChange={(e) => setJoinForm({ ...joinForm, code: e.target.value.toUpperCase() })}
              placeholder="例如 A1B2C3"
              maxLength={8}
            />
          </label>
          <label className="field">
            <span>房間密碼（如有）</span>
            <input
              value={joinForm.password}
              onChange={(e) => setJoinForm({ ...joinForm, password: e.target.value })}
              placeholder="選填"
            />
          </label>
        </Sheet>
      ) : null}
    </main>
  );
}
