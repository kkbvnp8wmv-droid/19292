import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { LogoMark } from '../components/Logo';
import { useToast } from '../components/ui';

type Mode = 'login' | 'register';

export default function AuthPage() {
  const { login, register, guest } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password, displayName.trim() || username.trim());
      }
      toast.push(mode === 'login' ? '歡迎回到 Poker Club' : '註冊成功，歡迎加入！', 'success');
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err?.message || '操作失敗，請再試一次');
    } finally {
      setBusy(false);
    }
  };

  const playAsGuest = async () => {
    setBusy(true);
    setError('');
    try {
      await guest(displayName.trim() || undefined);
      toast.push('已用遊客身分進入俱樂部', 'success');
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err?.message || '遊客登入失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-glow" />
      <div className="auth-card">
        <div className="auth-brand">
          <LogoMark size={62} />
          <h1>POKER CLUB</h1>
          <p className="muted">尊爵撲克俱樂部 · 全球即時對戰</p>
        </div>

        <div className="auth-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')} type="button">
            登入
          </button>
          <button
            className={mode === 'register' ? 'active' : ''}
            onClick={() => setMode('register')}
            type="button"
          >
            註冊
          </button>
        </div>

        <form onSubmit={submit} className="auth-form">
          <label>
            <span>帳號</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="輸入帳號"
              autoComplete="username"
              required
              minLength={3}
            />
          </label>
          {mode === 'register' && (
            <label>
              <span>暱稱</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="牌桌上的名字"
                maxLength={14}
              />
            </label>
          )}
          <label>
            <span>密碼</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 4 個字元"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={4}
            />
          </label>

          {error ? <div className="form-error">{error}</div> : null}

          <button className="btn gold block lg" type="submit" disabled={busy}>
            {busy ? '處理中…' : mode === 'login' ? '進入俱樂部' : '建立帳號'}
          </button>
        </form>

        <div className="divider">或</div>

        <button className="btn ghost block" onClick={playAsGuest} disabled={busy} type="button">
          以遊客身分快速開始
        </button>

        <p className="auth-note">
          註冊即可保存戰績、俱樂部與好友資料。遊客資料保存在此裝置，可隨時升級為正式帳號。
        </p>
      </div>
      <div className="auth-foot">僅供娛樂 · 免費遊戲積分無現金價值</div>
    </div>
  );
}
