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
import { Package, TrendingUp, BarChart3 } from 'lucide-react';

const DISP_COLORS = { RELEASE: '#059669', REWORK: '#d97706', HOLD: '#dc2626' };
const SEV_COLORS = { critical: '#dc2626', major: '#d97706', minor: '#6b7280' };

/* ──────────────────────────────────────────────
   Pure CSS/SVG chart components (Vercel-safe)
   ────────────────────────────────────────────── */

function DonutChart({ data, size = 120, strokeWidth = 20 }: {
  data: { name: string; value: number; color: string }[];
  size?: number;
  strokeWidth?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="flex items-center justify-center text-xs text-slate-400">No data</div>;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {data.map((d, i) => {
        const pct = d.value / total;
        const dashLen = pct * circumference;
        const dashOffset = -offset * circumference;
        offset += pct;
        return (
          <circle
            key={i}
            cx={size / 2} cy={size / 2} r={radius}
            fill="none"
            stroke={d.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${dashLen} ${circumference - dashLen}`}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dasharray 0.3s' }}
          />
        );
      })}
      <text x={size / 2} y={size / 2 - 6} textAnchor="middle" className="fill-slate-700" style={{ fontSize: 18, fontWeight: 700 }}>
        {total}
      </text>
      <text x={size / 2} y={size / 2 + 10} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 9 }}>
        total
      </text>
    </svg>
  );
}

function MiniBar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-500 w-16 shrink-0 truncate" title={label}>{label}</span>
      <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden">
        <div
          className="h-full rounded transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: color, minWidth: value > 0 ? 4 : 0 }}
        />
      </div>
      <span className="text-[10px] font-mono font-medium w-8 text-right">{value}</span>
    </div>
  );
}

function PassRateChart({ data, isZh }: { data: any[]; isZh: boolean }) {
  if (data.length < 2) return null;

  const minPR = Math.min(...data.map(d => d.pass_rate)) - 1;
  const maxPR = 100;
  const range = maxPR - minPR || 1;
  const w = 600, h = 180, px = 40, py = 10, pw = w - px - 10, ph = h - py - 25;

  const dateLabels = data.map(d => String(d.date || '').split('-').slice(1).join('/'));
  const stepX = data.length > 1 ? pw / (data.length - 1) : pw;

  const toY = (v: number) => py + ph - ((v - minPR) / range) * ph;

  // Build area path for pass_rate
  let areaPath = `M ${px} ${toY(data[0].pass_rate)}`;
  let linePath = areaPath;
  for (let i = 1; i < data.length; i++) {
    const x = px + i * stepX;
    const y = toY(data[i].pass_rate);
    areaPath += ` L ${x} ${y}`;
    linePath += ` L ${x} ${y}`;
  }
  areaPath += ` L ${px + (data.length - 1) * stepX} ${py + ph} L ${px} ${py + ph} Z`;

  // Build line path for cum_pass_rate
  let cumPath = `M ${px} ${toY(data[0].cum_pass_rate)}`;
  for (let i = 1; i < data.length; i++) {
    cumPath += ` L ${px + i * stepX} ${toY(data[i].cum_pass_rate)}`;
  }

  // Y-axis labels
  const yTicks = [minPR, Math.round((minPR + 100) / 2), 100];

  // 98% threshold line
  const y98 = toY(98);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ minWidth: 400 }}>
        {/* Grid lines */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={px} y1={toY(v)} x2={px + pw} y2={toY(v)} stroke="#e2e8f0" strokeDasharray="3 3" />
            <text x={px - 4} y={toY(v) + 3} textAnchor="end" className="fill-slate-400" style={{ fontSize: 9 }}>{v}%</text>
          </g>
        ))}
        {/* 98% threshold */}
        <line x1={px} y1={y98} x2={px + pw} y2={y98} stroke="#059669" strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
        <text x={px + pw + 2} y={y98 + 3} className="fill-emerald-600" style={{ fontSize: 8 }}>98%</text>
        {/* Area fill */}
        <path d={areaPath} fill="#dbeafe" opacity={0.6} />
        {/* Daily PR line */}
        <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth={2} />
        {/* Cumulative PR line (dashed) */}
        <path d={cumPath} fill="none" stroke="#059669" strokeWidth={2} strokeDasharray="5 5" />
        {/* Data points for daily PR */}
        {data.map((d, i) => {
          const x = px + i * stepX;
          const y = toY(d.pass_rate);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={3} fill={d.pass_rate < 98 ? '#dc2626' : '#3b82f6'} />
              {data.length <= 15 && (
                <text x={x} y={h - 4} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 8 }}>
                  {dateLabels[i]}
                </text>
              )}
            </g>
          );
        })}
        {/* Legend */}
        <line x1={px} y1={h - 3} x2={px + 12} y2={h - 3} stroke="#3b82f6" strokeWidth={2} />
        <text x={px + 14} y={h} className="fill-slate-600" style={{ fontSize: 8 }}>{isZh ? '日合格率' : 'Daily PR'}</text>
        <line x1={px + 80} y1={h - 3} x2={px + 92} y2={h - 3} stroke="#059669" strokeWidth={2} strokeDasharray="3 3" />
        <text x={px + 94} y={h} className="fill-slate-600" style={{ fontSize: 8 }}>{isZh ? '累计合格率' : 'Cumulative PR'}</text>
      </svg>
    </div>
  );
}

function DefectTrendChart({ data, isZh, labels }: { data: any[]; isZh: boolean; labels: Record<string, string> }) {
  if (data.length < 2) return null;

  const maxDef = Math.max(...data.map(d => d.defects), 1);
  const maxDisp = Math.max(...data.map(d => Math.max(d.release_count || 0, d.rework_count || 0)), 1);
  const w = 600, h = 200, px = 40, py = 10, pw = w - px - 40, ph = h - py - 25;
  const stepX = data.length > 1 ? pw / (data.length - 1) : pw;
  const barW = Math.max(Math.min(stepX * 0.35, 14), 4);

  const toYDef = (v: number) => py + ph - (v / maxDef) * ph;
  const toYDisp = (v: number) => py + ph - (v / maxDisp) * ph;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ minWidth: 400 }}>
        {/* Left Y-axis (defects) */}
        {[0, Math.round(maxDef / 2), maxDef].map((v, i) => (
          <g key={`yl${i}`}>
            <line x1={px} y1={toYDef(v)} x2={px + pw} y2={toYDef(v)} stroke="#e2e8f0" strokeDasharray="3 3" />
            <text x={px - 4} y={toYDef(v) + 3} textAnchor="end" className="fill-slate-400" style={{ fontSize: 9 }}>{v}</text>
          </g>
        ))}
        {/* Right Y-axis (disposition) */}
        {[0, Math.round(maxDisp / 2), maxDisp].map((v, i) => (
          <text key={`yr${i}`} x={px + pw + 4} y={toYDisp(v) + 3} className="fill-slate-400" style={{ fontSize: 9 }}>{v}</text>
        ))}

        {/* Bars + lines */}
        {data.map((d, i) => {
          const cx = px + i * stepX;
          return (
            <g key={i}>
              {/* Total defects bar */}
              <rect x={cx - barW - 1} y={toYDef(d.defects)} width={barW} height={py + ph - toYDef(d.defects)} rx={2} fill="#fca5a5" />
              {/* Critical defects bar */}
              <rect x={cx + 1} y={toYDef(d.critical)} width={barW} height={py + ph - toYDef(d.critical)} rx={2} fill="#dc2626" />
              {/* Date label */}
              {data.length <= 15 && (
                <text x={cx} y={h - 4} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 8 }}>
                  {String(d.date || '').split('-').slice(1).join('/')}
                </text>
              )}
            </g>
          );
        })}
        {/* Release line (right axis) */}
        <polyline
          fill="none" stroke="#059669" strokeWidth={2}
          points={data.map((d, i) => `${px + i * stepX},${toYDisp(d.release_count || 0)}`).join(' ')}
        />
        {/* Rework line (right axis) */}
        <polyline
          fill="none" stroke="#d97706" strokeWidth={2}
          points={data.map((d, i) => `${px + i * stepX},${toYDisp(d.rework_count || 0)}`).join(' ')}
        />
        {/* Data points */}
        {data.map((d, i) => {
          const cx = px + i * stepX;
          return (
            <g key={`dp${i}`}>
              <circle cx={cx} cy={toYDisp(d.release_count || 0)} r={2.5} fill="#059669" />
              <circle cx={cx} cy={toYDisp(d.rework_count || 0)} r={2.5} fill="#d97706" />
            </g>
          );
        })}
        {/* Legend */}
        <rect x={px} y={h - 3} width={8} height={8} rx={1} fill="#fca5a5" />
        <text x={px + 10} y={h + 4} className="fill-slate-600" style={{ fontSize: 8 }}>{labels.defects}</text>
        <rect x={px + 60} y={h - 3} width={8} height={8} rx={1} fill="#dc2626" />
        <text x={px + 70} y={h + 4} className="fill-slate-600" style={{ fontSize: 8 }}>{labels.critDef}</text>
        <line x1={px + 130} y1={h + 1} x2={px + 142} y2={h + 1} stroke="#059669" strokeWidth={2} />
        <text x={px + 144} y={h + 4} className="fill-slate-600" style={{ fontSize: 8 }}>{labels.release}</text>
        <line x1={px + 195} y1={h + 1} x2={px + 207} y2={h + 1} stroke="#d97706" strokeWidth={2} />
        <text x={px + 209} y={h + 4} className="fill-slate-600" style={{ fontSize: 8 }}>{labels.rework}</text>
      </svg>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Main Page
   ────────────────────────────────────────────── */

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
                  <DonutChart data={dispPie} size={130} strokeWidth={18} />
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
                  <DonutChart data={sevPie} size={130} strokeWidth={18} />
                  <div className="space-y-2">
                    {[
                      { label: lbl.crit, val: data.critical_defects, color: 'text-red-600', bg: 'bg-red-600' },
                      { label: lbl.major, val: data.major_defects, color: 'text-amber-600', bg: 'bg-amber-600' },
                      { label: lbl.minor, val: data.minor_defects, color: 'text-gray-600', bg: 'bg-gray-400' },
                    ].map((d, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${d.bg}`} />
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

          {/* Defect category bars */}
          {data.total_defects > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">{isZh ? '缺陷类别分布' : 'Defect Category Distribution'}</CardTitle></CardHeader>
              <CardContent className="p-4 space-y-2">
                {(() => {
                  const cats = [
                    { name: 'Packaging', label: isZh ? '包装' : 'Packaging' },
                    { name: 'Label', label: isZh ? '标签' : 'Label' },
                    { name: 'Accessory', label: isZh ? '配件' : 'Accessory' },
                    { name: 'Appearance', label: isZh ? '外观' : 'Appearance' },
                    { name: 'Hardware', label: isZh ? '五金' : 'Hardware' },
                    { name: 'Stitching', label: isZh ? '针车' : 'Stitching' },
                    { name: 'Other', label: isZh ? '其它' : 'Other' },
                  ];
                  // We don't have per-category data in rekap response, so use a placeholder bar chart based on severity
                  return null;
                })()}
                <MiniBar value={data.critical_defects || 0} max={data.total_defects || 1} color="#dc2626" label={lbl.crit} />
                <MiniBar value={data.major_defects || 0} max={data.total_defects || 1} color="#d97706" label={lbl.major} />
                <MiniBar value={data.minor_defects || 0} max={data.total_defects || 1} color="#6b7280" label={lbl.minor} />
              </CardContent>
            </Card>
          )}

          {/* Pass Rate Trend */}
          {trendData.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" /> {lbl.prTrend}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <PassRateChart data={trendData} isZh={isZh} />
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
                <DefectTrendChart data={trendData} isZh={isZh} labels={lbl} />
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