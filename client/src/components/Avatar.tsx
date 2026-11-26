import React from 'react';

/** 原創頭像：以 SVG 幾何圖形產生，不依賴外部圖片 */
const PALETTES: Record<string, [string, string, string]> = {
  a1: ['#1f3a63', '#0a1626', '#e8c37a'],
  a2: ['#0f5c46', '#061e19', '#5fe0b0'],
  a3: ['#5a2340', '#1c0a16', '#ff9ec4'],
  a4: ['#2b3f6b', '#0a1224', '#8fb6ff'],
  a5: ['#6b4318', '#221305', '#ffd08a'],
  a6: ['#3a2a63', '#130d24', '#c0a6ff'],
  a7: ['#154257', '#05161f', '#7bd9f2'],
  a8: ['#5c2020', '#1c0707', '#ff9a8f'],
  a9: ['#2c4a2a', '#0b160a', '#a8e08a'],
  a10: ['#3e3e46', '#111116', '#d8dbe4'],
  a11: ['#4a2f5e', '#170e20', '#f2a8ff'],
  a12: ['#173f3f', '#041616', '#6fe6d8'],
};

const SHAPES = [
  // 黑桃
  'M32 12c-5.5 6.6-12.5 10.7-12.5 17 0 4.3 3.4 7.4 7.5 7.4 2.2 0 4-1 4.9-2.5-.3 3.5-1.7 6.6-4.3 8.8h8.8c-2.6-2.2-4-5.3-4.3-8.8.9 1.5 2.7 2.5 4.9 2.5 4.1 0 7.5-3.1 7.5-7.4 0-6.3-7-10.4-12.5-17Z',
  // 方塊
  'M32 10 48 32 32 54 16 32Z',
  // 梅花
  'M32 12a9 9 0 0 1 6.4 15.3 9 9 0 1 1-4.4 15.4h-4a9 9 0 1 1-4.4-15.4A9 9 0 0 1 32 12Z',
  // 圓環
  'M32 13a19 19 0 1 0 0 38 19 19 0 0 0 0-38Zm0 8a11 11 0 1 1 0 22 11 11 0 0 1 0-22Z',
  // 星形
  'M32 11 39.5 26 56 28.4 44 40.2 47 56.5 32 48.5 17 56.5 20 40.2 8 28.4 24.5 26Z',
];

export function avatarKey(id: string | null | undefined): string {
  if (!id) return 'a1';
  if (PALETTES[id]) return id;
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 9973;
  return `a${(hash % 12) + 1}`;
}

export function Avatar({
  id,
  name,
  size = 40,
  level,
  ring = false,
  className = '',
}: {
  id?: string | null;
  name?: string | null;
  size?: number;
  level?: number;
  ring?: boolean;
  className?: string;
}) {
  const key = avatarKey(id);
  const [c1, c2, accent] = PALETTES[key] || PALETTES.a1;
  const shape = SHAPES[(Number(key.replace('a', '')) - 1) % SHAPES.length];
  const gid = `g-${key}-${size}`;
  return (
    <div
      className={`avatar ${ring ? 'ring' : ''} ${className}`}
      style={{ width: size, height: size }}
      title={name || undefined}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
        <rect width="64" height="64" fill={`url(#${gid})`} />
        <circle cx="52" cy="12" r="16" fill={accent} opacity="0.16" />
        <circle cx="12" cy="54" r="14" fill={accent} opacity="0.12" />
        <g opacity="0.92">
          <path d={shape} fill={accent} opacity="0.9" />
        </g>
      </svg>
      {level ? <span className="level-badge">{level}</span> : null}
    </div>
  );
}

export const AVATAR_OPTIONS = Object.keys(PALETTES);
