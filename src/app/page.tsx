'use client';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import LoginPage from '@/components/LoginPage';
import DashboardLayout from './(dashboard)/layout';

function AppRouter() {
  const { view, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <img src="/sula-logo.png" alt="SULA" className="h-16 w-auto animate-pulse" />
          <div className="h-6 w-32 animate-pulse rounded bg-slate-200" />
        </div>
      </div>
    );
  }

  if (view === 'login' || !view) {
    return <LoginPage />;
  }

  return <DashboardLayout />;
}

export default function Home() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
