// 前端 API 客戶端
export type Settings = {
  sound: boolean;
  music: boolean;
  animation: 'slow' | 'normal' | 'fast';
  tableTheme: string;
  cardStyle: string;
  language: string;
  notifications: boolean;
  privacy: string;
  lowPerformance: boolean;
  autoMuck: boolean;
  fourColor: boolean;
};

export type Stats = {
  handsPlayed: number;
  handsWon: number;
  showdowns: number;
  showdownWins: number;
  chipsWon: number;
  chipsLost: number;
  biggestPot: number;
  allIns: number;
  tournamentsPlayed: number;
  tournamentsWon: number;
  timePlayed: number;
  bestHand: string | null;
  handCategories: Record<string, number>;
};

export type User = {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  bio: string;
  country: string;
  level: number;
  xp: number;
  xpNext: number;
  xpCurrent: number;
  chips: number;
  isGuest: boolean;
  createdAt: number;
  stats: Stats;
  settings: Settings;
  achievements: string[];
  titles: string[];
  daily: { lastClaim: number; streak: number };
  clubId: string | null;
  online: boolean;
};

const TOKEN_KEY = 'pokerclub.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 忽略儲存失敗 */
  }
}

export class ApiError extends Error {}

export async function api<T = any>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, {
    method: init.method || (init.body ? 'POST' : 'GET'),
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok || (data && data.ok === false)) {
    throw new ApiError(data?.error || `請求失敗（${res.status}）`);
  }
  return data as T;
}
