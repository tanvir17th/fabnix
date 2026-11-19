'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { ApiError, RequestOptions, apiFetch } from './api';

export type UserType = 'CUSTOMER' | 'SHOPKEEPER' | 'SUPER_ADMIN';

export interface SessionUser {
  id: string;
  type: UserType;
  fullName: string;
  email: string | null;
  phone: string | null;
  preferredLanguage: 'bn' | 'en' | null;
}

interface LoginResult {
  user: SessionUser;
  accessToken: string;
}

interface AuthState {
  status: 'loading' | 'anonymous' | 'authenticated';
  user: SessionUser | null;
  login(type: UserType, identifier: string, password: string): Promise<SessionUser>;
  logout(): Promise<void>;
  /** Authenticated API call with one transparent refresh on 401. */
  call<T = unknown>(path: string, opts?: Omit<RequestOptions, 'token'>): Promise<T>;
  setLanguage(lang: 'bn' | 'en'): Promise<void>;
  updateUser(patch: Partial<SessionUser>): void;
}

const Ctx = createContext<AuthState | null>(null);

/**
 * Access token lives only in memory (never localStorage); the refresh token is
 * an httpOnly cookie scoped to /api/v1/auth. A page reload restores the
 * session through POST /auth/refresh (FR-004).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const token = useRef<string | null>(null);
  const refreshing = useRef<Promise<boolean> | null>(null);
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const accept = useCallback((r: LoginResult) => {
    token.current = r.accessToken;
    setUser(r.user);
    setStatus('authenticated');
  }, []);

  const refresh = useCallback(async (): Promise<boolean> => {
    refreshing.current ??= apiFetch<LoginResult>('/auth/refresh', { method: 'POST', body: {} })
      .then((r) => {
        accept(r);
        return true;
      })
      .catch(() => {
        token.current = null;
        setUser(null);
        setStatus('anonymous');
        return false;
      })
      .finally(() => {
        refreshing.current = null;
      });
    return refreshing.current;
  }, [accept]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // NFR-L10N-002: the user's saved language follows them across devices.
  const synced = useRef(false);
  useEffect(() => {
    if (synced.current || !user?.preferredLanguage) return;
    synced.current = true;
    if (user.preferredLanguage !== locale) router.replace(pathname, { locale: user.preferredLanguage });
  }, [user, locale, pathname, router]);

  const call = useCallback(
    async <T,>(path: string, opts: Omit<RequestOptions, 'token'> = {}): Promise<T> => {
      if (status === 'loading' && refreshing.current) await refreshing.current;
      try {
        return await apiFetch<T>(path, { ...opts, token: token.current });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401 && e.code === 'UNAUTHENTICATED' && (await refresh())) {
          return apiFetch<T>(path, { ...opts, token: token.current });
        }
        throw e;
      }
    },
    [refresh, status],
  );

  const login = useCallback(
    async (type: UserType, identifier: string, password: string) => {
      const r = await apiFetch<LoginResult>('/auth/login', { method: 'POST', body: { type, identifier, password } });
      // The caller navigates once, directly in the user's saved language (see login page);
      // the effect above only handles sessions restored on page load.
      synced.current = true;
      accept(r);
      return r.user;
    },
    [accept],
  );

  const logout = useCallback(async () => {
    await apiFetch('/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
    token.current = null;
    setUser(null);
    setStatus('anonymous');
  }, []);

  const setLanguage = useCallback(
    async (lang: 'bn' | 'en') => {
      if (token.current) {
        await apiFetch('/users/me/preferences', { method: 'PATCH', body: { preferredLanguage: lang }, token: token.current }).catch(() => undefined);
        setUser((u) => (u ? { ...u, preferredLanguage: lang } : u));
      }
    },
    [],
  );

  const updateUser = useCallback((patch: Partial<SessionUser>) => setUser((u) => (u ? { ...u, ...patch } : u)), []);

  const value = useMemo<AuthState>(() => ({ status, user, login, logout, call, setLanguage, updateUser }), [status, user, login, logout, call, setLanguage, updateUser]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
