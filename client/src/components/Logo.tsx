import React from 'react';

/** 原創品牌標誌：黑桃 + 皇冠 + 撲克俱樂部字標 */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="Poker Club 標誌" role="img">
      <defs>
        <linearGradient id="pcGold" x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="#fdf1d0" />
          <stop offset="45%" stopColor="#e8c37a" />
          <stop offset="100%" stopColor="#a97f33" />
        </linearGradient>
        <linearGradient id="pcDeep" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#16304f" />
          <stop offset="100%" stopColor="#050c16" />
        </linearGradient>
        <linearGradient id="pcGreen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2ec48c" />
          <stop offset="100%" stopColor="#0b6a4b" />
        </linearGradient>
      </defs>
      <path
        d="M32 2.5 58 12v24.5C58 48 46.6 57.2 32 61.5 17.4 57.2 6 48 6 36.5V12Z"
        fill="url(#pcDeep)"
        stroke="url(#pcGold)"
        strokeWidth="2.4"
      />
      <path
        d="M32 16.5c-4.6 5.6-10.4 9-10.4 14.2 0 3.6 2.9 6.2 6.3 6.2 1.9 0 3.4-.8 4.1-2.1-.3 3-1.4 5.6-3.6 7.4h7.2c-2.2-1.8-3.3-4.4-3.6-7.4.7 1.3 2.2 2.1 4.1 2.1 3.4 0 6.3-2.6 6.3-6.2 0-5.2-5.8-8.6-10.4-14.2Z"
        fill="url(#pcGold)"
      />
      <path d="M25.5 13.2 32 8l6.5 5.2-2.4 1.1L32 11.4l-4.1 2.9Z" fill="url(#pcGreen)" />
      <circle cx="32" cy="47.4" r="1.6" fill="url(#pcGreen)" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <LogoMark size={compact ? 30 : 34} />
      {!compact && (
        <span>
          POKER CLUB
          <small>PREMIUM POKER ROOM</small>
        </span>
      )}
    </div>
  );
}

/** 牌桌絨布上的中央浮水印圖形 */
export function TableEmblem({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" opacity="0.14" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="none" stroke="#ffffff" strokeWidth="1.2" />
      <circle cx="32" cy="32" r="24" fill="none" stroke="#e8c37a" strokeWidth="0.8" />
      <path
        d="M32 18c-4 4.8-9 7.8-9 12.3 0 3.1 2.5 5.4 5.5 5.4 1.6 0 2.9-.7 3.5-1.8-.2 2.6-1.2 4.8-3.1 6.4h6.2c-1.9-1.6-2.9-3.8-3.1-6.4.6 1.1 1.9 1.8 3.5 1.8 3 0 5.5-2.3 5.5-5.4 0-4.5-5-7.5-9-12.3Z"
        fill="#ffffff"
      />
    </svg>
  );
}
