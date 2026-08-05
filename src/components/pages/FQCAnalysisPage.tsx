'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useBusinessTypeLock } from '@/contexts/BusinessTypeContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RefreshCw, Download, Loader2, Info } from 'lucide-react';
import { CATEGORY_ZH, SUBDEFECT_NAMES_ZH, SUBDEFECT_NAMES } from '@/lib/rca-generator';

/** Lookup: English sub-defect name → Mandarin */
const SUBDEFECT_ZH_MAP: Record<string, string> = {};
SUBDEFECT_NAMES.forEach((name, idx) => {
  if (SUBDEFECT_NAMES_ZH[idx]) SUBDEFECT_ZH_MAP[name] = SUBDEFECT_NAMES_ZH[idx];
});

const PIE_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280',
];

const BAR_COLORS = [
  '#dc2626', '#ea580c', '#d97706', '#65a30d',
  '#0d9488', '#2563eb', '#7c3aed', '#db2777', '#4b5563',
  '#b91c1c', '#c2410c', '#a16207', '#4d7c0f',
  '#0f766e', '#1d4ed8', '#6d28d9', '#be185d', '#374151',
  '#991b1b', '#9a3412',
];

/* ── CSS-only Donut Chart ──────────────────────────────── */
function DonutChart({ data, total }: { data: { label: string; value: number; color: string }[]; total: number }) {
  if (!data.length) return null;
  const size = 180;
  const r = 70;
  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = 28;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* background circle */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} />
        {data.map((d, i) => {
          const pct = total > 0 ? d.value / total : 0;
          const dash = pct * circumference;
          const gap = circumference - dash;
          const el = (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
          offset += dash;
          return el;
        })}
        {/* center text */}
        <text x={cx} y={cy - 6} textAnchor="middle" className="text-base font-bold" fill="#1e293b">{total}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="text-[10px]" fill="#64748b">total</text>
      </svg>
      {/* legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 justify-center">
        {data.map((d, i) => (
          <span key={i} className="flex items-center gap-1 text-[10px] text-slate-600">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: d.color }} />
            {d.label} ({d.value})
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── CSS-only Horizontal Bar Chart ─────────────────────── */
function HorizontalBarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  if (!data.length) return null;
  const maxVal = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-[180px] shrink-0 text-[10px] text-slate-600 text-right truncate" title={d.label}>{d.label}</div>
          <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden">
            <div
              className="h-full rounded transition-all"
              style={{ width: `${(d.value / maxVal) * 100}%`, backgroundColor: d.color, minWidth: d.value > 0 ? 4 : 0 }}
            />
          </div>
          <div className="w-10 text-right text-[10px] font-medium text-slate-700">{d.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ── CSS-only Vertical Bar Chart ───────────────────────── */
function VerticalBarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  if (!data.length) return null;
  const maxVal = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1" style={{ height: 220 }}>
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex items-end justify-center" style={{ height: 180 }}>
            <div
              className="w-full max-w-[32px] rounded-t"
              style={{ height: `${(d.value / maxVal) * 100}%`, backgroundColor: d.color, minHeight: d.value > 0 ? 3 : 0 }}
              title={`${d.label}: ${d.value}`}
            />
          </div>
          <div className="text-[8px] text-slate-500 truncate w-full text-center" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', maxHeight: 50, overflow: 'hidden' }}>
            {d.label}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────── */
export default function FQCAnalysisPage() {
  const { t, lang } = useI18n();
  const isZhMode = lang === 'zh';
  const zhCategory = (cat: string) => (isZhMode ? (CATEGORY_ZH[cat] || cat) : cat);
  const zhSubDefect = (sub: string) => (isZhMode ? (SUBDEFECT_ZH_MAP[sub] || sub) : sub);
  const { effectiveType, isLocked } = useBusinessTypeLock();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [businessType, setBusinessType] = useState('ALL');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const bt = effectiveType || businessType;
      if (bt !== 'ALL') params.set('business_type', bt);

      const res = await fetch(`/api/fqc/analysis?${params}`);
      if (res.ok) {
        setData(await res.json());
      } else {
        setError('Failed to fetch data');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, businessType, effectiveType]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const categorySummary = data?.section_a?.category_summary || [];
  const topSubDefects = data?.section_b?.top_sub_defects || [];
  const topStyles = data?.section_c?.top_styles || [];
  const grandTotal = data?.grand_total_defects || 0;

  // Prepare chart data
  const pieData = useMemo(() =>
    categorySummary.map((c: any, i: number) => ({
      label: t(`defect.${c.categoryKey?.replace('defect_', '') || 'other'}`),
      value: c.defectCount,
      color: PIE_COLORS[i % PIE_COLORS.length],
    })),
    [categorySummary, t]
  );

  const subBarData = useMemo(() =>
    topSubDefects.map((s: any, i: number) => ({
      label: zhSubDefect(s.name || ''),
      value: s.count || 0,
      color: BAR_COLORS[i % BAR_COLORS.length],
    })),
    [topSubDefects, isZhMode]
  );

  const styleBarData = useMemo(() =>
    topStyles.map((s: any, i: number) => ({
      label: s.style || '',
      value: s.defectCount || 0,
      color: i < 3 ? '#ef4444' : '#3b82f6',
    })),
    [topStyles]
  );

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const bt = effectiveType || businessType;
      const filters: Record<string, string> = {};
      if (dateFrom) filters.date_from = dateFrom;
      if (dateTo) filters.date_to = dateTo;
      if (bt !== 'ALL') filters.business_type = bt;

      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'fqc-analysis-combined', filters }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Export failed');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const period = dateFrom ? `${dateFrom}_${dateTo || 'all'}` : 'All';
      a.download = `SULA-QC_FQC_Analysis_Report_${period}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Filters + Download ─────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 min-w-0">
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('common.from')}</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9" />
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('common.to')}</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9" />
            </div>
            <div className="w-full sm:w-40">
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('fqc.businessType')}</label>
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
            <Button variant="outline" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); setBusinessType('ALL'); }} className="h-9">
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> {t('action.reset')}
            </Button>
            <Button size="sm" onClick={handleExport} disabled={exporting || loading} className="h-9 bg-blue-600 hover:bg-blue-700 text-white">
              {exporting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />}
              {t('action.download')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      {/* ── Section A: Category Summary ────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">A. {t('rca.topCategories')}</CardTitle>
          <p className="text-xs text-slate-500">{t('common.total')}: {grandTotal} | {t('common.records')}: {data?.total_records || 0}</p>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-blue-50 border border-blue-100">
            <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700 leading-relaxed">{t('analysis.tipCategory')}</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Donut Chart */}
            <div className="flex items-center justify-center py-4">
              {loading ? <Skeleton className="h-[220px] w-[220px] rounded-full" />
                : pieData.some(d => d.value > 0) ? <DonutChart data={pieData} total={grandTotal} />
                : <div className="text-sm text-slate-400">{t('common.noData')}</div>}
            </div>
            {/* Table */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-xs w-10">#</TableHead>
                    <TableHead className="text-xs">{t('analysis.category')}</TableHead>
                    <TableHead className="text-xs text-right">{t('rca.defectCount')}</TableHead>
                    <TableHead className="text-xs text-right">{t('rca.percentage')}</TableHead>
                    <TableHead className="text-xs text-right">PPM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? Array.from({ length: 9 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                  )) : categorySummary.length > 0 ? categorySummary.map((c: any, i: number) => {
                    const inspectedTotal = data?.total_records;
                    const ppm = inspectedTotal > 0 ? Math.round((c.defectCount / (inspectedTotal * 100)) * 1000000) : 0;
                    return (
                      <TableRow key={i} className="hover:bg-slate-50">
                        <TableCell className="text-xs font-medium text-slate-500">{i + 1}</TableCell>
                        <TableCell className="text-xs font-medium">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                            {t(`defect.${c.categoryKey?.replace('defect_', '') || 'other'}`)}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-right font-medium">{c.defectCount}</TableCell>
                        <TableCell className="text-xs text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(c.percentage, 100)}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                            </div>
                            {c.percentage}%
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-right">{ppm.toLocaleString()}</TableCell>
                      </TableRow>
                    );
                  }) : (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-sm text-slate-400">{t('common.noData')}</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section B: Top 20 Sub-Defects ──────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">B. {t('rca.subDefects')} {t('analysis.top20')}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-amber-50 border border-amber-100">
            <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 leading-relaxed">{t('analysis.tipSubDefect')}</p>
          </div>
          <div className="mb-4">
            {loading ? <Skeleton className="h-[400px] w-full rounded-lg" />
              : subBarData.length > 0 ? <HorizontalBarChart data={subBarData} />
              : <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">{t('common.noData')}</div>}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="text-xs w-10">#</TableHead>
                  <TableHead className="text-xs">{t('rca.subDefectCol')}</TableHead>
                  <TableHead className="text-xs">{t('analysis.category')}</TableHead>
                  <TableHead className="text-xs text-right">{t('rca.defectCount')}</TableHead>
                  <TableHead className="text-xs text-right">{t('rca.percentage')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                )) : topSubDefects.length > 0 ? topSubDefects.map((s: any, i: number) => (
                  <TableRow key={i} className="hover:bg-slate-50">
                    <TableCell className="text-xs font-medium text-slate-500">{i + 1}</TableCell>
                    <TableCell className="text-xs font-medium">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
                        {zhSubDefect(s.name)}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{zhCategory(s.category)}</TableCell>
                    <TableCell className="text-xs text-right font-medium">{s.count}</TableCell>
                    <TableCell className="text-xs text-right">{s.percentage}%</TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-sm text-slate-400">{t('common.noData')}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Section C: Top 15 Styles ───────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">C. {t('rca.topStyles')} {t('analysis.top15')}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-rose-50 border border-rose-100">
            <Info className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />
            <p className="text-xs text-rose-700 leading-relaxed">{t('analysis.tipStyle')}</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="py-2">
              {loading ? <Skeleton className="h-[280px] w-full rounded-lg" />
                : styleBarData.length > 0 ? <VerticalBarChart data={styleBarData} />
                : <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">{t('common.noData')}</div>}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-xs w-10">#</TableHead>
                    <TableHead className="text-xs">{t('fqc.style')}</TableHead>
                    <TableHead className="text-xs text-right">{t('rca.defectCount')}</TableHead>
                    <TableHead className="text-xs text-right">{t('fqc.inspectedQty')}</TableHead>
                    <TableHead className="text-xs text-right">{t('fqc.defectRate')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                  )) : topStyles.length > 0 ? topStyles.map((s: any, i: number) => (
                    <TableRow key={i} className="hover:bg-slate-50">
                      <TableCell className="text-xs font-medium text-slate-500">{i + 1}</TableCell>
                      <TableCell className="text-xs font-medium">{s.style}</TableCell>
                      <TableCell className="text-xs text-right font-medium">{s.defectCount}</TableCell>
                      <TableCell className="text-xs text-right">{s.totalInspected?.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right">
                        <span className={s.defectRate > 5 ? 'text-red-600 font-medium' : ''}>{s.defectRate}%</span>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-sm text-slate-400">{t('common.noData')}</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
