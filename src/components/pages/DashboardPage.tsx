'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useBusinessTypeLock } from '@/contexts/BusinessTypeContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CheckCircle2, XCircle, Package, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { SUBDEFECT_NAMES_ZH, SUBDEFECT_NAMES } from '@/lib/rca-generator';

/** Lookup: English sub-defect name → Mandarin */
const SUBDEFECT_ZH_MAP: Record<string, string> = {};
SUBDEFECT_NAMES.forEach((name, idx) => {
  if (SUBDEFECT_NAMES_ZH[idx]) SUBDEFECT_ZH_MAP[name] = SUBDEFECT_NAMES_ZH[idx];
});
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';

const PERIODS = ['day', 'week', 'month', 'quarter', 'year'] as const;
const BUSINESS_TYPES = ['ALL', 'PTOEM', 'PTB2C', 'PTGH'] as const;

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#84cc16'];

export default function DashboardPage() {
  const { t, lang } = useI18n();
  const isZhMode = lang === 'zh';
  const zhSubDefect = (sub: string) => (isZhMode ? (SUBDEFECT_ZH_MAP[sub] || sub) : sub);
  const { effectiveType, isLocked } = useBusinessTypeLock();
  const [period, setPeriod] = useState<string>('day');
  const [businessType, setBusinessType] = useState<string>('ALL');
  const [fqcData, setFqcData] = useState<any>(null);
  const [oqcData, setOqcData] = useState<any>(null);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ period, page_size: '500' });
        const bt = effectiveType || businessType;
        if (bt !== 'ALL') params.set('business_type', bt);

        const [fqcRes, oqcRes, analysisRes] = await Promise.all([
          fetch(`/api/fqc/inspections?${params}`),
          fetch(`/api/oqc/lots?${params}`),
          fetch(`/api/fqc/analysis?${params}`),
        ]);

        if (fqcRes.ok) setFqcData(await fqcRes.json());
        if (oqcRes.ok) setOqcData(await oqcRes.json());
        if (analysisRes.ok) setAnalysisData(await analysisRes.json());
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [period, businessType, effectiveType]);

  // Compute stats
  const stats = {
    totalInspected: fqcData?.subtotals?.total_inspected_qty || 0,
    passRate: fqcData?.subtotals?.total_inspected_qty
      ? Math.round((fqcData.subtotals.total_ok_qty / fqcData.subtotals.total_inspected_qty) * 10000) / 100
      : 0,
    ngCount: fqcData?.subtotals?.total_ng_qty || 0,
    activeLots: oqcData?.lots?.length || 0,
  };

  // Pass rate trend from FQC records
  const trendData = (() => {
    if (!fqcData?.records?.length) return [];
    const dateMap: Record<string, { ok: number; total: number }> = {};
    for (const r of fqcData.records) {
      const d = r.inspection_date?.split('T')[0] || 'Unknown';
      if (!dateMap[d]) dateMap[d] = { ok: 0, total: 0 };
      dateMap[d].ok += Number(r.ok_qty) || 0;
      dateMap[d].total += Number(r.inspected_qty) || 0;
    }
    return Object.entries(dateMap)
      .map(([date, v]) => ({
        date: date.slice(5),
        rate: v.total > 0 ? Math.round((v.ok / v.total) * 10000) / 100 : 0,
      }))
      .slice(-14);
  })();

  // Defect distribution pie
  const pieData = analysisData?.section_a?.category_summary
    ?.filter((c: any) => c.defectCount > 0)
    .map((c: any) => ({
      name: t(`defect.${c.categoryKey?.replace('defect_', '') || 'other'}`),
      value: c.defectCount,
    }))
    .slice(0, 6) || [];

  // Top 5 defects bar
  const barData = analysisData?.section_b?.top_sub_defects
    ?.slice(0, 5)
    .map((s: any) => ({ name: zhSubDefect(s.name || '').slice(0, 20) || '', count: s.count })) || [];

  // Recent activity
  const recentFQC = (fqcData?.records || []).slice(0, 5);
  const recentOQC = (oqcData?.lots || []).slice(0, 3);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-lg" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
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

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{t('dashboard.todayInspected')}</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{stats.totalInspected.toLocaleString()}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{t('dashboard.todayPassRate')}</p>
                <p className="text-2xl font-bold mt-1" style={{ color: stats.passRate >= 95 ? '#059669' : stats.passRate >= 90 ? '#d97706' : '#dc2626' }}>
                  {stats.passRate}%
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{t('dashboard.todayNG')}</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{stats.ngCount.toLocaleString()}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{t('oqc.dailyLots')}</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{stats.activeLots}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pass Rate Trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">{t('dashboard.passRateTrend')}</CardTitle>
        </CardHeader>
        <CardContent>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" fontSize={12} tickLine={false} />
                <YAxis domain={[85, 100]} fontSize={12} tickLine={false} />
                <Tooltip formatter={(value: number) => [`${value}%`, t('common.passRate')]} />
                <Line type="monotone" dataKey="rate" stroke="#059669" strokeWidth={2} dot={{ fill: '#059669', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-400 text-sm">{t('common.noData')}</div>
          )}
        </CardContent>
      </Card>

      {/* Pie + Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">{t('dashboard.defectDistribution')}</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                    fontSize={11}
                  >
                    {pieData.map((_: any, index: number) => (
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
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={barData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" fontSize={12} />
                  <YAxis type="category" dataKey="name" fontSize={11} width={100} tickLine={false} />
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

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">{t('dashboard.recentActivity')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Recent FQC */}
            <div>
              <h4 className="text-sm font-medium text-slate-600 mb-2">FQC {t('common.records')}</h4>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-xs">{t('common.date')}</TableHead>
                      <TableHead className="text-xs">{t('fqc.style')}</TableHead>
                      <TableHead className="text-xs">{t('fqc.inspectedQty')}</TableHead>
                      <TableHead className="text-xs">{t('fqc.okQty')}</TableHead>
                      <TableHead className="text-xs">{t('fqc.ngQty')}</TableHead>
                      <TableHead className="text-xs">{t('fqc.defectRate')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentFQC.length > 0 ? recentFQC.map((r: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{r.inspection_date?.split('T')[0]}</TableCell>
                        <TableCell className="text-xs font-medium">{r.style}</TableCell>
                        <TableCell className="text-xs">{r.inspected_qty}</TableCell>
                        <TableCell className="text-xs text-emerald-600">{r.ok_qty}</TableCell>
                        <TableCell className="text-xs text-red-600">{r.ng_qty}</TableCell>
                        <TableCell className="text-xs">{r.defect_rate}%</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-xs text-slate-400 py-6">{t('common.noData')}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Recent OQC */}
            <div>
              <h4 className="text-sm font-medium text-slate-600 mb-2">OQC {t('common.records')}</h4>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-xs">{t('common.date')}</TableHead>
                      <TableHead className="text-xs">{t('oqc.lotSize')}</TableHead>
                      <TableHead className="text-xs">{t('oqc.passRate')}</TableHead>
                      <TableHead className="text-xs">{t('oqc.disposition')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentOQC.length > 0 ? recentOQC.map((lot: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{lot.lot_date?.split('T')[0]}</TableCell>
                        <TableCell className="text-xs">{lot.lot_size}</TableCell>
                        <TableCell className="text-xs">{lot.pass_rate != null ? (Number(lot.pass_rate) <= 1 ? `${Math.round(Number(lot.pass_rate) * 10000) / 100}` : `${Math.round(Number(lot.pass_rate) * 100) / 100}`) : '-'}%</TableCell>
                        <TableCell className="text-xs">
                          <Badge
                            variant="outline"
                            className={
                              lot.disposition === 'RELEASE'
                                ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                                : lot.disposition === 'REWORK'
                                ? 'border-amber-300 text-amber-700 bg-amber-50'
                                : 'border-red-300 text-red-700 bg-red-50'
                            }
                          >
                            {t(`disposition.${lot.disposition?.toLowerCase()}`)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-xs text-slate-400 py-6">{t('common.noData')}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
