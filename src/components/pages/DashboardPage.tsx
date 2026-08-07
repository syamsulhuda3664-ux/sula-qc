'use client';

import { useState, useEffect, useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useBusinessTypeLock } from '@/contexts/BusinessTypeContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Package, TrendingUp, AlertTriangle, BarChart3, Layers } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area, Legend,
} from 'recharts';
import { SUBDEFECT_NAMES_ZH } from '@/lib/rca-generator';

const PERIODS = ['day', 'week', 'month', 'quarter', 'year'] as const;
const BUSINESS_TYPES = ['ALL', 'PTOEM', 'PTB2C', 'PTGH'] as const;

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1'];
const STACKED_COLORS = ['#10b981', '#f59e0b', '#ef4444'];
const DEFECT_TREND_COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1'];

interface DashData {
  kpi: {
    totalInspected: number; totalOK: number; totalNG: number; passRate: number;
    totalDefects: number; oqcTotalLots: number; oqcReleaseLots: number;
    oqcReworkLots: number; oqcHoldLots: number;
  };
  fqcDaily: { date: string; inspected: number; ok: number; ng: number; passRate: number; defects: number }[];
  oqcDaily: { date: string; release: number; rework: number; hold: number; totalLots: number; lotSize: number; sampled: number; passRate: number; defects: number }[];
  defectCategories: { category: string; count: number; percentage: number }[];
  defectDailyTrend: Record<string, string | number>[];
  topDefects: { name: string; count: number }[];
}

export default function DashboardPage() {
  const { t, lang } = useI18n();
  const isZhMode = lang === 'zh';
  const { effectiveType, isLocked } = useBusinessTypeLock();
  const [period, setPeriod] = useState<string>('day');
  const [businessType, setBusinessType] = useState<string>('ALL');
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ period });
        const bt = effectiveType || businessType;
        if (bt !== 'ALL') params.set('business_type', bt);
        const res = await fetch(`/api/dashboard?${params}`);
        if (res.ok) setData(await res.json());
      } catch { /* ignore */ } finally { setLoading(false); }
    };
    fetchDashboard();
  }, [period, businessType, effectiveType]);

  // ── Derived data ──
  const pieData = useMemo(() =>
    (data?.defectCategories || []).filter((c) => c.count > 0).slice(0, 6),
    [data]
  );

  const barData = useMemo(() =>
    (data?.topDefects || []).slice(0, 8).map((d) => {
      const idx = SUBDEFECT_NAMES_ZH.indexOf(d.name);
      return { name: isZhMode && idx >= 0 ? d.name : d.name, count: d.count };
    }),
    [data, isZhMode]
  );

  const tickFormat = (v: string) => {
    if (!v) return '';
    const parts = v.split('-');
    return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : v;
  };

  // ── Loading skeleton ──
  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
        <Skeleton className="h-80 rounded-lg" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
        <Skeleton className="h-72 rounded-lg" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
      </div>
    );
  }

  const { kpi } = data;
  const periodLabel = t(`time.${period === 'day' ? 'today' : period === 'week' ? 'thisWeek' : period === 'month' ? 'thisMonth' : period === 'quarter' ? 'thisQuarter' : 'thisYear'}`);

  return (
    <div className="space-y-6">
      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <Tabs value={period} onValueChange={setPeriod}>
          <TabsList className="bg-slate-100">
            {PERIODS.map((p) => (
              <TabsTrigger key={p} value={p} className="text-xs sm:text-sm">
                {t(`time.${p === 'day' ? 'today' : p === 'week' ? 'thisWeek' : p === 'month' ? 'thisMonth' : p === 'quarter' ? 'thisQuarter' : 'thisYear'}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Tabs value={businessType} onValueChange={setBusinessType}>
          <TabsList className="bg-slate-100">
            {BUSINESS_TYPES.map((bt) => (
              <TabsTrigger key={bt} value={bt} className="text-xs sm:text-sm" disabled={isLocked}>
                {bt === 'ALL' ? t('common.all') : t(`business.${bt.toLowerCase()}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">{t('dashboard.periodInspected')}</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{kpi.totalInspected.toLocaleString()}</p>
                <p className="text-xs text-slate-400 mt-1">{periodLabel}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">{t('dashboard.periodPassRate')}</p>
                <p className="text-2xl font-bold mt-1" style={{ color: kpi.passRate >= 95 ? '#059669' : kpi.passRate >= 90 ? '#d97706' : '#dc2626' }}>
                  {kpi.passRate}%
                </p>
                <p className="text-xs text-slate-400 mt-1">{kpi.totalOK.toLocaleString()} / {kpi.totalInspected.toLocaleString()}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">{t('dashboard.periodNG')}</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{kpi.totalNG.toLocaleString()}</p>
                <p className="text-xs text-slate-400 mt-1">{t('dashboard.defects')}: {kpi.totalDefects.toLocaleString()}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">{t('dashboard.oqcLots')}</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{kpi.oqcTotalLots}</p>
                <div className="flex gap-2 mt-1">
                  <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">R:{kpi.oqcReleaseLots}</Badge>
                  <Badge className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">W:{kpi.oqcReworkLots}</Badge>
                  <Badge className="text-[10px] bg-red-50 text-red-700 border-red-200">H:{kpi.oqcHoldLots}</Badge>
                </div>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <Layers className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── FQC Pass Rate Trend (cumulative) ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            {t('dashboard.passRateTrend')} ({periodLabel})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.fqcDaily.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.fqcDaily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tickFormatter={tickFormat} fontSize={11} tickLine={false} />
                <YAxis domain={[70, 100]} fontSize={11} tickLine={false} unit="%" />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any, name: any) => {
                    if (name === 'passRate') return [`${value}%`, t('common.passRate')];
                    return [value, name];
                  }}
                  labelFormatter={(label) => label}
                />
                <Line type="monotone" dataKey="passRate" stroke="#059669" strokeWidth={2.5}
                  dot={{ fill: '#059669', r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="defects" stroke="#ef4444" strokeWidth={1.5}
                  strokeDasharray="5 5" dot={false} yAxisId={0} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-400 text-sm">{t('common.noData')}</div>
          )}
        </CardContent>
      </Card>

      {/* ── Daily Volume + OQC Disposition (side by side) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Daily Inspection Volume */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-600" />
              {t('dashboard.dailyVolume')} ({periodLabel})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.fqcDaily.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.fqcDaily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tickFormatter={tickFormat} fontSize={11} tickLine={false} />
                  <YAxis fontSize={11} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="ok" stackId="a" fill="#10b981" name={t('dashboard.ok')} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="ng" stackId="a" fill="#ef4444" name={t('dashboard.ng')} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48 text-slate-400 text-sm">{t('common.noData')}</div>
            )}
          </CardContent>
        </Card>

        {/* OQC Disposition Trend */}
        <Card>
          <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              {t('dashboard.oqcDisposition')} ({periodLabel})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.oqcDaily.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.oqcDaily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tickFormatter={tickFormat} fontSize={11} tickLine={false} />
                  <YAxis fontSize={11} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="release" stackId="oqc" fill="#10b981" name={t('dashboard.release')} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="rework" stackId="oqc" fill="#f59e0b" name={t('dashboard.rework')} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="hold" stackId="oqc" fill="#ef4444" name={t('dashboard.hold')} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48 text-slate-400 text-sm">{t('common.noData')}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Defect Category Trend (Stacked Area) ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-purple-600" />
            {t('dashboard.defectTrend')} ({periodLabel})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.defectDailyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data.defectDailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tickFormatter={tickFormat} fontSize={11} tickLine={false} />
                <YAxis fontSize={11} tickLine={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {['Stitching', 'Appearance', 'Material', 'Hardware', 'Logo', 'Zipper', 'Webbing', 'Other', 'Preparation'].map((cat, i) => (
                  <Area key={cat} type="monotone" dataKey={cat} stackId="1"
                    stroke={DEFECT_TREND_COLORS[i] || '#999'} fill={DEFECT_TREND_COLORS[i] || '#999'}
                    fillOpacity={0.6} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-400 text-sm">{t('common.noData')}</div>
          )}
        </CardContent>
      </Card>

      {/* ── Pie + Bar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">{t('dashboard.defectDistribution')}</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                    paddingAngle={2} dataKey="count"
                    label={({ name, percent }: { name: string; percent?: number }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                    labelLine={false} fontSize={10}>
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48 text-slate-400 text-sm">{t('common.noData')}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">{t('dashboard.topDefects')}</CardTitle>
          </CardHeader>
          <CardContent>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={barData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" fontSize={11} />
                  <YAxis type="category" dataKey="name" fontSize={10} width={120} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48 text-slate-400 text-sm">{t('common.noData')}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Detailed Data Tables ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* FQC Daily Summary Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">FQC {t('common.summary')} ({periodLabel})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-72 overflow-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">{t('common.date')}</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">{t('dashboard.inspected')}</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">{t('dashboard.ok')}</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">{t('dashboard.ng')}</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">{t('common.passRate')}</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">{t('dashboard.defects')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.fqcDaily].reverse().map((row) => (
                    <tr key={row.date} className="border-t hover:bg-slate-50">
                      <td className="px-3 py-1.5 text-slate-700">{row.date}</td>
                      <td className="px-3 py-1.5 text-right text-slate-800 font-medium">{row.inspected.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right text-emerald-600">{row.ok.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right text-red-600">{row.ng.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right">
                        <span className={row.passRate >= 95 ? 'text-emerald-600' : row.passRate >= 90 ? 'text-amber-600' : 'text-red-600'}>
                          {row.passRate}%
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-600">{row.defects}</td>
                    </tr>
                  ))}
                  {data.fqcDaily.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-6 text-slate-400">{t('common.noData')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* OQC Daily Summary Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">OQC {t('common.summary')} ({periodLabel})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-72 overflow-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">{t('common.date')}</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">{t('dashboard.lotSize')}</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">{t('dashboard.sampled')}</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">{t('common.passRate')}</th>
                    <th className="px-3 py-2 text-center font-medium text-slate-600">{t('oqc.disposition')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.oqcDaily].reverse().map((row) => (
                    <tr key={row.date} className="border-t hover:bg-slate-50">
                      <td className="px-3 py-1.5 text-slate-700">{row.date}</td>
                      <td className="px-3 py-1.5 text-right text-slate-800 font-medium">{row.lotSize.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right text-slate-600">{row.sampled.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right">
                        <span className={row.passRate >= 95 ? 'text-emerald-600' : row.passRate >= 90 ? 'text-amber-600' : 'text-red-600'}>
                          {row.passRate}%
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <div className="flex justify-center gap-1">
                          {row.release > 0 && <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">R:{row.release}</Badge>}
                          {row.rework > 0 && <Badge className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">W:{row.rework}</Badge>}
                          {row.hold > 0 && <Badge className="text-[10px] bg-red-50 text-red-700 border-red-200">H:{row.hold}</Badge>}
                          {row.totalLots === 0 && '-'}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data.oqcDaily.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-6 text-slate-400">{t('common.noData')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
