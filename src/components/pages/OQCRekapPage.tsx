'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useBusinessTypeLock } from '@/contexts/BusinessTypeContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Package, TrendingUp, BarChart3, Target } from 'lucide-react';
import {
  Line, PieChart, Pie, Cell, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart,
} from 'recharts';

const DISP_COLORS = { RELEASE: '#059669', REWORK: '#d97706', HOLD: '#dc2626' };
const SEV_COLORS = { critical: '#dc2626', major: '#d97706', minor: '#6b7280' };

export default function OQCRekapPage() {
  const { t, lang } = useI18n();
  const isZh = lang === 'zh';
  const { effectiveType, isLocked } = useBusinessTypeLock();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [value, setValue] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [businessType, setBusinessType] = useState('ALL');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period, value });
      const bt = effectiveType || businessType;
      if (bt !== 'ALL') params.set('business_type', bt);
      const res = await fetch(`/api/oqc/rekap?${params}`);
      if (res.ok) setData(await res.json());
    } catch {} finally { setLoading(false); }
  }, [period, value, businessType, effectiveType]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const trendData = data?.trend_data || [];
  const dailyBreakdown = data?.daily_breakdown || [];
  const prColor = (data?.avg_pass_rate || 0) >= 98 ? '#059669' : (data?.avg_pass_rate || 0) >= 95 ? '#d97706' : '#dc2626';
  const releaseRate = data?.total_lots > 0 ? Math.round(((data?.release_lots || 0) / data?.total_lots) * 10000) / 100 : 0;

  // Labels
  const lbl = {
    monthly: isZh ? '月度' : 'Monthly',
    quarterly: isZh ? '季度' : 'Quarterly',
    yearly: isZh ? '年度' : 'Yearly',
    totalLots: isZh ? '批次总数' : 'Total Lots',
    lotSize: isZh ? '批次数量' : 'Lot Size',
    sampled: isZh ? '抽样数' : 'Sampled',
    passRate: isZh ? '合格率' : 'Pass Rate',
    releaseRate: isZh ? '放行率' : 'Release Rate',
    totalDefects: isZh ? '总缺陷' : 'Total Defects',
    disposition: isZh ? '处置分布' : 'Disposition',
    severity: isZh ? '缺陷严重程度' : 'Defect Severity',
    keyMetrics: isZh ? '关键指标' : 'Key Metrics',
    defectRate: isZh ? '缺陷率' : 'Defect Rate',
    avgDefLot: isZh ? '平均缺陷/批次' : 'Avg Defects/Lot',
    relQty: isZh ? '放行数量' : 'Released Qty',
    rewQty: isZh ? '返工数量' : 'Rework Qty',
    holdQty: isZh ? '扣留数量' : 'Hold Qty',
    prTrend: isZh ? '合格率趋势' : 'Pass Rate Trend',
    dailyPR: isZh ? '日合格率' : 'Daily PR',
    cumPR: isZh ? '累计合格率' : 'Cumulative PR',
    defTrend: isZh ? '缺陷数 & 处置趋势' : 'Defects & Disposition Trend',
    defects: isZh ? '缺陷数' : 'Defects',
    critDef: isZh ? '严重缺陷' : 'Critical Defects',
    release: isZh ? '放行' : 'Release',
    rework: isZh ? '返工' : 'Rework',
    hold: isZh ? '扣留' : 'Hold',
    daily: isZh ? '每日明细' : 'Daily Breakdown',
    lots: isZh ? '批次' : 'Lots',
    sample: isZh ? '抽样' : 'Sample',
    disp: isZh ? '处置' : 'Disposition',
    refresh: isZh ? '刷新' : 'Refresh',
    crit: isZh ? '严重' : 'Critical',
    major: isZh ? '主要' : 'Major',
    minor: isZh ? '次要' : 'Minor',
  };

  const dispPie = [
    { name: lbl.release, value: data?.release_lots || 0, color: DISP_COLORS.RELEASE },
    { name: lbl.rework, value: data?.rework_lots || 0, color: DISP_COLORS.REWORK },
    { name: lbl.hold, value: data?.hold_lots || 0, color: DISP_COLORS.HOLD },
  ].filter(d => d.value > 0);

  const sevPie = [
    { name: lbl.crit, value: data?.critical_defects || 0, color: SEV_COLORS.critical },
    { name: lbl.major, value: data?.major_defects || 0, color: SEV_COLORS.major },
    { name: lbl.minor, value: data?.minor_defects || 0, color: SEV_COLORS.minor },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-4">
      {/* Period Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <Tabs value={period} onValueChange={setPeriod}>
              <TabsList className="bg-slate-100">
                <TabsTrigger value="month" className="text-xs">{lbl.monthly}</TabsTrigger>
                <TabsTrigger value="quarter" className="text-xs">{lbl.quarterly}</TabsTrigger>
                <TabsTrigger value="year" className="text-xs">{lbl.yearly}</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="w-full sm:w-40">
              <Input type={period === 'year' ? 'number' : 'month'} value={value} onChange={(e) => setValue(e.target.value)} min={period === 'year' ? '2020' : undefined} className="h-9" />
            </div>
            <div className="w-full sm:w-36">
              <Select value={businessType} onValueChange={setBusinessType} disabled={isLocked}>
                <SelectTrigger className="h-9" disabled={isLocked}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('common.all')}</SelectItem>
                  <SelectItem value="PTOEM">PTOEM</SelectItem>
                  <SelectItem value="PTB2C">PTB2C</SelectItem>
                  <SelectItem value="PTGH">PTGH</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={fetchData} className="h-9">{lbl.refresh}</Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-lg" />)}</div>
      ) : !data || data.total_lots === 0 ? (
        <Card><CardContent className="py-16 text-center">
          <Package className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-400">{t('common.noData')}</p>
        </CardContent></Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: lbl.totalLots, val: data.total_lots, color: '' },
              { label: lbl.lotSize, val: (data.total_lot_size || 0).toLocaleString(), color: '' },
              { label: lbl.sampled, val: (data.total_sampled || 0).toLocaleString(), color: '' },
              { label: lbl.passRate, val: `${data.avg_pass_rate || 0}%`, color: prColor },
              { label: lbl.releaseRate, val: `${releaseRate}%`, color: '#059669' },
              { label: lbl.totalDefects, val: data.total_defects || 0, color: '#dc2626' },
            ].map((c, i) => (
              <Card key={i}><CardContent className="p-3 text-center">
                <p className="text-[10px] text-slate-500">{c.label}</p>
                <p className="text-xl font-bold" style={c.color ? { color: c.color } : undefined}>{c.val}</p>
              </CardContent></Card>
            ))}
          </div>

          {/* Disposition & Severity & Key Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Disposition Pie */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">{lbl.disposition}</CardTitle></CardHeader>
              <CardContent className="p-4">
                <div className="flex items-center justify-center gap-6">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie data={dispPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2}>
                        {dispPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {[
                      { label: lbl.release, count: data.release_lots, cls: 'bg-emerald-500' },
                      { label: lbl.rework, count: data.rework_lots, cls: 'bg-amber-500' },
                      { label: lbl.hold, count: data.hold_lots, cls: 'bg-red-500' },
                    ].map((d, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${d.cls}`} />
                        <span className="text-xs text-slate-600">{d.label}</span>
                        <Badge variant="outline" className="text-xs ml-auto">{d.count}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Severity Pie */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">{lbl.severity}</CardTitle></CardHeader>
              <CardContent className="p-4">
                <div className="flex items-center justify-center gap-6">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie data={sevPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2}>
                        {sevPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {[
                      { label: lbl.crit, val: data.critical_defects, color: 'text-red-600' },
                      { label: lbl.major, val: data.major_defects, color: 'text-amber-600' },
                      { label: lbl.minor, val: data.minor_defects, color: 'text-gray-600' },
                    ].map((d, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${d.color === 'text-red-600' ? 'bg-red-600' : d.color === 'text-amber-600' ? 'bg-amber-600' : 'bg-gray-400'}`} />
                        <span className="text-xs text-slate-600">{d.label}</span>
                        <span className={`text-xs font-bold ${d.color} ml-auto`}>{d.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Key Metrics */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">{lbl.keyMetrics}</CardTitle></CardHeader>
              <CardContent className="p-4 space-y-3">
                {[
                  { label: lbl.defectRate, val: data.total_sampled > 0 ? `${(data.total_defects / data.total_sampled * 100).toFixed(2)}%` : '0%', warn: data.total_sampled > 0 && (data.total_defects / data.total_sampled * 100) > 5 },
                  { label: lbl.avgDefLot, val: data.total_lots > 0 ? (data.total_defects / data.total_lots).toFixed(1) : '0' },
                  { label: lbl.relQty, val: (data.release_qty || 0).toLocaleString(), color: 'text-emerald-600' },
                  { label: lbl.rewQty, val: (data.rework_qty || 0).toLocaleString(), color: 'text-amber-600' },
                  { label: lbl.holdQty, val: (data.hold_qty || 0).toLocaleString(), color: 'text-red-600' },
                ].map((m, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">{m.label}</span>
                    <span className={`text-sm font-bold ${m.color || (m.warn ? 'text-red-600' : '')}`}>{m.val}</span>
                  </div>
                ))}
                <div className="border-t pt-2 flex justify-between items-center">
                  <span className="text-xs text-slate-500">{lbl.releaseRate}</span>
                  <Badge className={`text-xs ${releaseRate >= 90 ? 'bg-emerald-100 text-emerald-700' : releaseRate >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{releaseRate}%</Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Pass Rate Trend */}
          {trendData.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" /> {lbl.prTrend}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.split('-').slice(1).join('/')} />
                    <YAxis domain={[90, 100]} tick={{ fontSize: 10 }} unit="%" />
                    <Tooltip formatter={(val: number) => `${val}%`} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="pass_rate" name={lbl.dailyPR} fill="#dbeafe" stroke="#3b82f6" strokeWidth={2} />
                    <Line type="monotone" dataKey="cum_pass_rate" name={lbl.cumPR} stroke="#059669" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Defect & Disposition Trend */}
          {trendData.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-orange-500" /> {lbl.defTrend}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.split('-').slice(1).join('/')} />
                    <YAxis yAxisId="defects" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="disp" orientation="right" tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="defects" dataKey="defects" name={lbl.defects} fill="#fca5a5" radius={[2, 2, 0, 0]} />
                    <Bar yAxisId="defects" dataKey="critical" name={lbl.critDef} fill="#dc2626" radius={[2, 2, 0, 0]} />
                    <Line yAxisId="disp" type="monotone" dataKey="release_count" name={lbl.release} stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
                    <Line yAxisId="disp" type="monotone" dataKey="rework_count" name={lbl.rework} stroke="#d97706" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Daily Table */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">{lbl.daily}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="text-xs">{t('common.date')}</TableHead>
                      <TableHead className="text-xs text-right">{lbl.lots}</TableHead>
                      <TableHead className="text-xs text-right">{lbl.lotSize}</TableHead>
                      <TableHead className="text-xs text-right">{lbl.sample}</TableHead>
                      <TableHead className="text-xs text-right">{lbl.defects}</TableHead>
                      <TableHead className="text-xs text-right">{lbl.passRate}</TableHead>
                      <TableHead className="text-xs">{lbl.disp}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyBreakdown.map((d: any, i: number) => (
                      <TableRow key={i} className="hover:bg-slate-50">
                        <TableCell className="text-xs">{d.lot_date}</TableCell>
                        <TableCell className="text-xs text-right">{d.lot_count}</TableCell>
                        <TableCell className="text-xs text-right">{d.lot_size.toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-right">{d.sample_size.toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-right"><span className={d.defects > 0 ? 'text-red-600 font-medium' : ''}>{d.defects}</span></TableCell>
                        <TableCell className="text-xs text-right font-medium"><span className={d.pass_rate < 98 ? 'text-red-600' : 'text-emerald-600'}>{d.pass_rate}%</span></TableCell>
                        <TableCell className="text-xs">
                          <div className="flex gap-1">
                            {d.release_count > 0 && <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50 text-[10px]">R:{d.release_count}</Badge>}
                            {d.rework_count > 0 && <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50 text-[10px]">W:{d.rework_count}</Badge>}
                            {d.hold_count > 0 && <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50 text-[10px]">H:{d.hold_count}</Badge>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
