import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { fmt, timeAgo } from '../lib/format';
import { useAuth } from '../state/auth';
import { Avatar } from './Avatar';
import { Logo } from './Logo';
import { Sheet } from './ui';
import { getSocket } from '../lib/socket';

const NAV = [
  { to: '/', label: '大廳', icon: 'M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1Z' },
  { to: '/tables', label: '牌桌', icon: 'M3 7h18v10H3Zm3 13h12M8 7V5h8v2' },
  { to: '/tournaments', label: '賽事', icon: 'M8 4h8v4a4 4 0 0 1-8 0Zm4 8v5m-4 3h8' },
  { to: '/clubs', label: '俱樂部', icon: 'M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm-7 18a7 7 0 0 1 14 0' },
  { to: '/profile', label: '我的', icon: 'M12 12a4.2 4.2 0 1 0 0-8.4A4.2 4.2 0 0 0 12 12Zm-8 9a8 8 0 0 1 16 0' },
];

type Notice = { id: string; type?: string; text: string; createdAt?: number };

export function Shell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [openNotices, setOpenNotices] = useState(false);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    api<{ notifications: Notice[] }>('/me/notifications')
      .then((d) => setNotices(d.notifications || []))
      .catch(() => setNotices([]));
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const onNotify = (n: Notice) => {
      setNotices((prev) => [{ ...n, id: n.id || String(Date.now()) }, ...prev].slice(0, 30));
      setSeen(false);
    };
    socket.on('notify', onNotify);
    return () => {
      socket.off('notify', onNotify);
    };
  }, []);

  if (!user) return null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center' }}>
          <Logo />
        </button>
        <div className="grow" />
        <div className="player-pill" onClick={() => navigate('/profile')} role="presentation">
          <Avatar id={user.avatar} name={user.displayName} size={26} level={user.level} />
          <span className="chip-count">
            <i className="chip-icon" />
            {fmt(user.chips)}
          </span>
        </div>
        <button
          className="icon-btn"
          aria-label="通知"
          onClick={() => {
            setOpenNotices(true);
            setSeen(true);
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9Z" strokeLinejoin="round" />
            <path d="M10 18a2 2 0 0 0 4 0" strokeLinecap="round" />
          </svg>
          {!seen && notices.length > 0 ? <i className="badge-dot" /> : null}
        </button>
        <button className="icon-btn" aria-label="設定" onClick={() => navigate('/settings')}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.05A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.05A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.05A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.05a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.05a1.7 1.7 0 0 0-1.55 1Z" />
          </svg>
        </button>
      </header>

      <Outlet />

      <nav className="bottom-nav">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d={item.icon} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {openNotices ? (
        <Sheet title="通知" onClose={() => setOpenNotices(false)}>
          {notices.length === 0 ? (
            <div className="empty">目前沒有新通知</div>
          ) : (
            <div className="list">
              {notices.map((n) => (
                <div className="tile" key={n.id}>
                  <div className="t-main">
                    <div className="t-title">{n.text}</div>
                    <div className="t-sub">{n.createdAt ? timeAgo(n.createdAt) : '剛剛'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button className="btn block ghost" style={{ marginTop: 14 }} onClick={() => logout()}>
            登出帳號
          </button>
        </Sheet>
      ) : null}
    </div>
  );
}
