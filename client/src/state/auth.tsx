import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, type User } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';

type AuthState = {
  user: User | null;
  token: string | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, displayName: string) => Promise<void>;
  guest: (displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
  applyWallet: (chips: number) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(getToken());
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUserState(null);
      return;
    }
    try {
      const data = await api<{ user: User }>('/me');
      setUserState(data.user);
    } catch {
      setToken(null);
      setTokenState(null);
      setUserState(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setReady(true);
    })();
  }, [refresh]);

  const afterAuth = useCallback((nextToken: string, nextUser: User) => {
    setToken(nextToken);
    setTokenState(nextToken);
    setUserState(nextUser);
    connectSocket(nextToken);
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const data = await api<{ token: string; user: User }>('/auth/login', {
        body: { username, password },
      });
      afterAuth(data.token, data.user);
    },
    [afterAuth],
  );

  const register = useCallback(
    async (username: string, password: string, displayName: string) => {
      const data = await api<{ token: string; user: User }>('/auth/register', {
        body: { username, password, displayName },
      });
      afterAuth(data.token, data.user);
    },
    [afterAuth],
  );

  const guest = useCallback(
    async (displayName?: string) => {
      const data = await api<{ token: string; user: User }>('/auth/guest', {
        body: { displayName },
      });
      afterAuth(data.token, data.user);
    },
    [afterAuth],
  );

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* 忽略登出錯誤 */
    }
    disconnectSocket();
    setToken(null);
    setTokenState(null);
    setUserState(null);
  }, []);

  const setUser = useCallback((u: User) => setUserState(u), []);
  const applyWallet = useCallback(
    (chips: number) => setUserState((prev) => (prev ? { ...prev, chips } : prev)),
    [],
  );

  const value = useMemo<AuthState>(
    () => ({ user, token, ready, login, register, guest, logout, refresh, setUser, applyWallet }),
    [user, token, ready, login, register, guest, logout, refresh, setUser, applyWallet],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必須在 AuthProvider 內使用');
  return ctx;
}
