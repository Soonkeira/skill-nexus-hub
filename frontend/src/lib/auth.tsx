'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import api from './api';
import type { User } from './types';

interface AuthContextType {
  user: User | null;
  isLoggedIn: boolean;
  authLoading: boolean;
  isAdmin: boolean;
  isPublisher: boolean;
  login: (username: string, password: string, captcha_id?: string) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const PUBLIC_PATHS = ['/login', '/register'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const isAdmin = user?.role === 'admin';
  const isPublisher = Boolean(user);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    document.cookie = 'token=; path=/; max-age=0';
    setUser(null);
    setIsLoggedIn(false);
    if (!PUBLIC_PATHS.includes(pathname)) {
      router.push('/login');
    }
  }, [router, pathname]);

  const fetchUser = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
      setIsLoggedIn(true);
      localStorage.setItem('user', JSON.stringify(data));
    } catch {
      logout();
    } finally {
      setAuthLoading(false);
    }
  }, [logout]);

  const login = useCallback(async (username: string, password: string, captcha_id?: string) => {
    const { data } = await api.post('/auth/login', { username, password, captcha_id });
    localStorage.setItem('token', data.access_token);
    document.cookie = `token=${data.access_token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
    await fetchUser();
    const redirect = localStorage.getItem('redirect_after_login') || '/';
    localStorage.removeItem('redirect_after_login');
    router.push(redirect);
  }, [fetchUser, router]);

  // Listen for 401 events from api interceptor
  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setIsLoggedIn(false);
      setAuthLoading(false);
      if (!PUBLIC_PATHS.includes(pathname)) {
        router.push('/login');
      }
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [router, pathname]);

  // Initial auth check
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setAuthLoading(false); return; }
    const cached = localStorage.getItem('user');
    if (cached) {
      try { setUser(JSON.parse(cached)); } catch { /* ignore parse errors */ }
    }
    fetchUser();
  }, [fetchUser]);

  return (
    <AuthContext.Provider value={{ user, isLoggedIn, authLoading, isAdmin, isPublisher, login, logout, fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
