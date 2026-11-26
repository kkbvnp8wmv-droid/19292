import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Settings as SettingsShape } from '../lib/api';
import { useAuth } from '../state/auth';
import { Switch, useToast } from '../components/ui';

const TABLE_THEMES = [
  { v: 'emerald', l: '翡翠綠' },
  { v: 'ocean', l: '深海藍' },
  { v: 'royal', l: '皇家紫' },
  { v: 'noir', l: '曜石黑' },
];

const CARD_STYLES = [
  { v: 'classic', l: '經典' },
  { v: 'minimal', l: '極簡' },
  { v: 'lux', l: '燙金' },
];

const ANIMATIONS = [
  { v: 'off', l: '關閉' },
  { v: 'normal', l: '標準' },
  { v: 'fast', l: '快速' },
];

export default function Settings() {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const settings: SettingsShape = (user?.settings || {}) as SettingsShape;

  const patch = async (key: string, value: string | boolean) => {
    if (!user) return;
    const next = { ...settings, [key]: value } as SettingsShape;
    setUser({ ...user, settings: next });
    try {
      const res = await api<{ settings: SettingsShape }>('/me/settings', {
        method: 'PATCH',
        body: { [key]: value },
      });
      setUser({ ...user, settings: res.settings || next });
    } catch (err: any) {
      toast.push(err?.message || '設定儲存失敗', 'error');
    }
  };

  const doLogout = async () => {
    setBusy(true);
    try {
      await logout();
      navigate('/auth');
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  return (
    <main className="page">
      <div className="page-head">
        <h1>設定</h1>
      </div>

      <section className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          音效與動畫
        </div>
        <Switch on={!!settings.sound} onChange={(v) => patch('sound', v)} label="音效" desc="發牌、籌碼與獲勝音效" />
        <Switch on={!!settings.music} onChange={(v) => patch('music', v)} label="背景音樂" desc="俱樂部大廳音樂" />
        <Switch
          on={!!settings.lowPerformance}
          onChange={(v) => patch('lowPerformance', v)}
          label="低效能模式"
          desc="關閉高耗資源動畫，較舊手機更順暢"
        />
        <div className="field">
          <span>動畫速度</span>
          <div className="seg-inline">
            {ANIMATIONS.map((a) => (
              <button
                key={a.v}
                className={`chip ${settings.animation === a.v ? 'active' : ''}`}
                onClick={() => patch('animation', a.v)}
              >
                {a.l}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          牌桌外觀
        </div>
        <div className="field">
          <span>牌桌背景</span>
          <div className="seg-inline">
            {TABLE_THEMES.map((t) => (
              <button
                key={t.v}
                className={`chip ${settings.tableTheme === t.v ? 'active' : ''}`}
                onClick={() => patch('tableTheme', t.v)}
              >
                {t.l}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>牌面樣式</span>
          <div className="seg-inline">
            {CARD_STYLES.map((c) => (
              <button
                key={c.v}
                className={`chip ${settings.cardStyle === c.v ? 'active' : ''}`}
                onClick={() => patch('cardStyle', c.v)}
              >
                {c.l}
              </button>
            ))}
          </div>
        </div>
        <Switch
          on={!!settings.fourColor}
          onChange={(v) => patch('fourColor', v)}
          label="四色牌面"
          desc="以四種顏色區分花色，更容易辨識"
        />
        <Switch
          on={!!settings.autoMuck}
          onChange={(v) => patch('autoMuck', v)}
          label="自動棄牌"
          desc="結束牌局自動收起底牌"
        />
      </section>

      <section className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          通知與隱私
        </div>
        <Switch
          on={!!settings.notifications}
          onChange={(v) => patch('notifications', v)}
          label="遊戲通知"
          desc="好友邀請、賽事開賽與牌桌邀請"
        />
        <div className="field">
          <span>個人資料可見度</span>
          <div className="seg-inline">
            {[
              { v: 'everyone', l: '所有人' },
              { v: 'friends', l: '僅好友' },
              { v: 'private', l: '僅自己' },
            ].map((p) => (
              <button
                key={p.v}
                className={`chip ${settings.privacy === p.v ? 'active' : ''}`}
                onClick={() => patch('privacy', p.v)}
              >
                {p.l}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>語言</span>
          <div className="seg-inline">
            <button className={`chip ${settings.language === 'zh-TW' ? 'active' : ''}`} onClick={() => patch('language', 'zh-TW')}>
              繁體中文
            </button>
            <button className={`chip ${settings.language === 'en' ? 'active' : ''}`} onClick={() => patch('language', 'en')}>
              English
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          帳號
        </div>
        <div className="list">
          <button className="tile clickable" onClick={() => navigate('/profile')}>
            <div className="t-main">
              <div className="t-title">編輯個人資料</div>
              <div className="t-sub">暱稱、頭像、自我介紹</div>
            </div>
          </button>
          <a className="tile clickable" href="mailto:support@pokerclub.game">
            <div className="t-main">
              <div className="t-title">客服中心</div>
              <div className="t-sub">support@pokerclub.game</div>
            </div>
          </a>
          <div className="tile">
            <div className="t-main">
              <div className="t-title">遊戲版本</div>
              <div className="t-sub">Poker Club 1.0.0 · 免費遊戲，無真實金錢交易</div>
            </div>
          </div>
        </div>
        <button className="btn danger block" style={{ marginTop: 12 }} onClick={doLogout} disabled={busy}>
          登出帳號
        </button>
      </section>
    </main>
  );
}
