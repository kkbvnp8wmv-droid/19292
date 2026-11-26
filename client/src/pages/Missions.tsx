import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { fmt } from '../lib/format';
import { useAuth } from '../state/auth';
import { Progress, Segmented, useToast } from '../components/ui';

type Mission = {
  id: string;
  title: string;
  desc: string;
  target: number;
  progress: number;
  chips: number;
  xp: number;
  icon: string;
  done: boolean;
  claimed?: boolean;
};

type Achievement = {
  id: string;
  title: string;
  desc: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: number;
  reward?: { chips?: number; xp?: number };
};

export default function Missions() {
  const { applyWallet, refreshUser } = useAuth() as any;
  const toast = useToast();
  const [tab, setTab] = useState('missions');
  const [missions, setMissions] = useState<Mission[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, a] = await Promise.all([
        api<{ missions: Mission[] }>('/missions'),
        api<{ achievements: Achievement[] }>('/me/achievements'),
      ]);
      setMissions(m.missions || []);
      setAchievements(a.achievements || []);
    } catch (err: any) {
      toast.push(err?.message || '載入任務失敗', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const claim = async (m: Mission) => {
    setBusyId(m.id);
    try {
      const res = await api<{ chips?: number; xp?: number }>(`/missions/${m.id}/claim`, {
        method: 'POST',
        body: {},
      });
      toast.push(`任務完成！獲得 ${fmt(m.chips)} 積分、${m.xp} 經驗`, 'success');
      setMissions((prev) => prev.map((x) => (x.id === m.id ? { ...x, claimed: true } : x)));
      if (refreshUser) await refreshUser();
      void res;
    } catch (err: any) {
      toast.push(err?.message || '領取失敗', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const claimable = missions.filter((m) => m.done && !m.claimed).length;
  const unlocked = useMemo(() => achievements.filter((a) => a.unlocked).length, [achievements]);

  return (
    <main className="page">
      <div className="page-head">
        <h1>任務與成就</h1>
        <span className="pill gold">{claimable} 項可領取</span>
      </div>

      <Segmented
        options={[
          { value: 'missions', label: '任務' },
          { value: 'achievements', label: `成就 ${unlocked}/${achievements.length || 0}` },
        ]}
        value={tab}
        onChange={setTab}
      />

      {loading ? (
        <div className="empty">載入中…</div>
      ) : tab === 'missions' ? (
        <div className="list" style={{ marginTop: 12 }}>
          {missions.map((m) => (
            <article className="mission-card" key={m.id}>
              <div className="m-icon">{m.icon || '★'}</div>
              <div className="grow">
                <div className="m-title">{m.title}</div>
                <div className="t-sub">{m.desc}</div>
                <Progress value={m.progress} total={m.target} green={m.done} />
                <div className="m-meta">
                  <span className="pill">{Math.min(m.progress, m.target)}/{m.target}</span>
                  <span className="pill gold">+{fmt(m.chips)} 積分</span>
                  <span className="pill">+{m.xp} XP</span>
                </div>
              </div>
              <button
                className={`btn sm ${m.claimed ? 'ghost' : m.done ? 'gold' : 'ghost'}`}
                disabled={!m.done || m.claimed || busyId === m.id}
                onClick={() => claim(m)}
              >
                {m.claimed ? '已領取' : m.done ? '領取' : '進行中'}
              </button>
            </article>
          ))}
          {missions.length === 0 ? <div className="empty">目前沒有任務</div> : null}
        </div>
      ) : (
        <div className="ach-grid">
          {achievements.map((a) => (
            <article className={`ach-card ${a.unlocked ? 'on' : ''}`} key={a.id}>
              <div className="ach-icon">{a.icon || '🏅'}</div>
              <div className="a-title">{a.title}</div>
              <div className="t-sub">{a.desc}</div>
              <span className={`pill ${a.unlocked ? 'green' : ''}`}>
                {a.unlocked ? '已達成' : '未達成'}
              </span>
            </article>
          ))}
          {achievements.length === 0 ? <div className="empty">尚無成就資料</div> : null}
        </div>
      )}
    </main>
  );
}
