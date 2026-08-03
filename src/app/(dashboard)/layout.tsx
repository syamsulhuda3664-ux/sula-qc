'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  LayoutDashboard,
  FileSpreadsheet,
  BarChart3,
  Search,
  Upload,
  Package,
  FileText,
  Activity,
  Users,
  LogOut,
  Menu,
  ChevronLeft,
} from 'lucide-react';
import DashboardPage from './dashboard/page';
import FQCDailyPage from './fqc/daily/page';
import FQCAnalysisPage from './fqc/analysis/page';
import FQCRCAPage from './fqc/rca/page';
import FQCUploadPage from './fqc/upload/page';
import OQCLotsPage from './oqc/lots/page';
import OQCRekapPage from './oqc/rekap/page';
import IPQCPage from './ipqc/page';
import UsersPage from './users/page';

type PageKey =
  | 'dashboard'
  | 'fqc-daily'
  | 'fqc-analysis'
  | 'fqc-rca'
  | 'fqc-upload'
  | 'oqc-lots'
  | 'oqc-rekap'
  | 'ipqc'
  | 'users';

interface MenuItem {
  key: PageKey;
  icon: ReactNode;
  labelKey: string;
  roles?: string[];
  badge?: boolean;
}

const menuItems: MenuItem[] = [
  { key: 'dashboard', icon: <LayoutDashboard className="h-5 w-5" />, labelKey: 'menu.dashboard' },
  { key: 'fqc-daily', icon: <FileSpreadsheet className="h-5 w-5" />, labelKey: 'menu.fqc.dailyDetail' },
  { key: 'fqc-analysis', icon: <BarChart3 className="h-5 w-5" />, labelKey: 'menu.fqc.defectAnalysis' },
  { key: 'fqc-rca', icon: <Search className="h-5 w-5" />, labelKey: 'menu.fqc.rca', badge: true },
  { key: 'fqc-upload', icon: <Upload className="h-5 w-5" />, labelKey: 'menu.fqc.upload', roles: ['staff_qa', 'manager_qc'] },
  { key: 'oqc-lots', icon: <Package className="h-5 w-5" />, labelKey: 'menu.oqc.dailyLots' },
  { key: 'oqc-rekap', icon: <FileText className="h-5 w-5" />, labelKey: 'menu.oqc.rekap' },
  { key: 'ipqc', icon: <Activity className="h-5 w-5" />, labelKey: 'menu.ipqc' },
  { key: 'users', icon: <Users className="h-5 w-5" />, labelKey: 'menu.userManagement', roles: ['staff_qa'] },
];

function getPageComponent(key: PageKey, isFullAccess: boolean): ReactNode {
  switch (key) {
    case 'dashboard':
      return <DashboardPage />;
    case 'fqc-daily':
      return <FQCDailyPage />;
    case 'fqc-analysis':
      return <FQCAnalysisPage />;
    case 'fqc-rca':
      return <FQCRCAPage />;
    case 'fqc-upload':
      return isFullAccess ? <FQCUploadPage /> : null;
    case 'oqc-lots':
      return <OQCLotsPage />;
    case 'oqc-rekap':
      return <OQCRekapPage />;
    case 'ipqc':
      return <IPQCPage />;
    case 'users':
      return <UsersPage />;
    default:
      return <DashboardPage />;
  }
}

interface SidebarNavProps {
  items: MenuItem[];
  activePage: PageKey;
  onItemClick: (key: PageKey) => void;
  collapsed: boolean;
  rcaPending: boolean;
  userName: string;
  userRole: string;
  onLogout: () => void;
}

function SidebarNav({ items, activePage, onItemClick, collapsed, rcaPending, userName, userRole, onLogout }: SidebarNavProps) {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col bg-slate-900 text-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-4 border-b border-slate-700/50">
        <img src="/sula-icon.png" alt="SULA" className="h-8 w-8 flex-shrink-0" />
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight">SULA-QC</span>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {items.map((item) => (
            <button
              key={item.key}
              onClick={() => onItemClick(item.key)}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left ${
                activePage === item.key
                  ? 'bg-white/15 text-white'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {item.icon}
              {!collapsed && <span>{t(item.labelKey)}</span>}
              {item.badge && rcaPending && !collapsed && (
                <span className="ml-auto h-2.5 w-2.5 rounded-full bg-red-500" />
              )}
              {item.badge && rcaPending && collapsed && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
              )}
            </button>
          ))}
        </nav>
      </ScrollArea>

      {/* User info at bottom */}
      <div className="border-t border-slate-700/50 p-4">
        {!collapsed && (
          <div className="mb-3">
            <p className="text-sm font-medium text-white truncate">{userName}</p>
            <p className="text-xs text-slate-400">{t(`role.${userRole}`)}</p>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onLogout}
          className="w-full justify-start text-slate-400 hover:text-white hover:bg-white/10"
        >
          <LogOut className="h-4 w-4 mr-2" />
          {!collapsed && 'Logout'}
        </Button>
      </div>
    </div>
  );
}

export default function DashboardLayout() {
  const { user, logout, isFullAccess } = useAuth();
  const { t, lang } = useI18n();
  const [activePage, setActivePage] = useState<PageKey>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [rcaPending, setRcaPending] = useState(false);

  useEffect(() => {
    const checkRCA = async () => {
      try {
        const res = await fetch('/api/fqc/rca');
        if (res.ok) {
          const data = await res.json();
          const records = data.records || [];
          setRcaPending(records.some((r: { rca_actions?: Array<{ status: string }> }) => {
            const actions = r.rca_actions || [];
            return actions.length > 0 && !actions.some((a: { status: string }) => a.status === 'completed');
          }));
        }
      } catch {
        // ignore
      }
    };
    checkRCA();
  }, [activePage]);

  const visibleMenuItems = menuItems.filter(
    (item) => !item.roles || item.roles.includes(user?.role || '')
  );

  const handleMenuClick = (key: PageKey) => {
    setActivePage(key);
    setMobileOpen(false);
  };

  const sidebarProps: SidebarNavProps = {
    items: visibleMenuItems,
    activePage,
    onItemClick: handleMenuClick,
    collapsed: sidebarCollapsed,
    rcaPending,
    userName: user?.display_name || '',
    userRole: user?.role || '',
    onLogout: logout,
  };

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col border-r border-slate-200 bg-slate-900 transition-all duration-300 ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        <SidebarNav {...sidebarProps} />
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute top-20 -right-3 z-10 hidden lg:flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 hover:text-slate-600 shadow-sm"
          style={{ left: sidebarCollapsed ? '52px' : '244px' }}
        >
          <ChevronLeft className={`h-3.5 w-3.5 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} />
        </button>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top header */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                <SidebarNav {...sidebarProps} collapsed={false} />
              </SheetContent>
            </Sheet>
            <h1 className="text-lg font-semibold text-slate-800">
              {t(
                visibleMenuItems.find((m) => m.key === activePage)?.labelKey || 'menu.dashboard'
              )}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs font-normal">
              {lang === 'zh' ? '中文' : 'EN'}
            </Badge>
            {user && (
              <span className="hidden sm:inline text-sm text-slate-600">{user.display_name}</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="text-slate-500 hover:text-slate-700"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {getPageComponent(activePage, isFullAccess)}
        </main>
      </div>
    </div>
  );
}
