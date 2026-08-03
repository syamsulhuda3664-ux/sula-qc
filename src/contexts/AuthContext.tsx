'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getRoleLanguage, type Lang } from '@/lib/i18n';

type View = 'login' | 'dashboard' | string;

export interface AuthUser {
  id: string;
  username: string;
  display_name: string;
  role: string;
  language: Lang;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  view: View;
  setView: (view: View) => void;
  isFullAccess: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('login');

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        const lang = data.user.language || getRoleLanguage(data.user.role);
        setUser({ ...data.user, language: lang as Lang });
        setView('dashboard');
      } else {
        setUser(null);
        setView('login');
      }
    } catch {
      setUser(null);
      setView('login');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (username: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Login failed' };
      }
      const lang = getRoleLanguage(data.user.role);
      setUser({ ...data.user, language: lang as Lang });
      setView('dashboard');
      return { success: true };
    } catch {
      return { success: false, error: 'Network error' };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setUser(null);
    setView('login');
  };

  const isFullAccess = user ? (user.role === 'staff_qa' || user.role === 'manager_qc') : false;

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, view, setView, isFullAccess }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
