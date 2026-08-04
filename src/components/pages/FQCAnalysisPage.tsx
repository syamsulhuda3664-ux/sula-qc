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
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';

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

export default function FQCAnalysisPage() {
  const { t } = useI18n();
  const { effectiveType, isLocked } = useBusinessTypeLock();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [businessType, setBusinessType] = useState('ALL');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const bt = effectiveType || businessType;
      if (bt !== 'ALL') params.set('business_type', bt);

      const res = await fetch(`/api/fqc/analysis?${params}`);
      if (res.ok) setData(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, businessType, effectiveType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const categorySummary = data?.section_a?.category_summary || [];
  const topSubDefects = data?.section_b?.top_sub_defects || [];
  const topStyles = data?.section_c?.top_styles || [];
  const grandTotal = data?.grand_total_defects || 0;

  // Prepare chart data with i18n category names
  const categoryChartData = useMemo(() =>
    categorySummary.map((c: any) => ({
      ...c,
      label: t(`defect.${c.categoryKey?.replace('defect_', '') || 'other'}`),
    })),
    [categorySummary, t]
  );

  const subDefectChartData = useMemo(() =>
    topSubDefects.map((s: any) => ({
      ...s,
      label: s.name,
    })),
    [topSubDefects]
  );

  const styleChartData = useMemo(() =>
    topStyles.map((s: any) => ({
      ...s,
      label: s.style,
    })),
    [topStyles]
  );

  // Export handler
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
      {/* Filters + Download */}
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
            <Button
              size="sm"
              onClick={handleExport}
              disabled={exporting || loading}
              className="h-9 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {exporting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />}
              {t('action.download')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Section A: Category Summary — Chart + Table side by side */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">A. {t('rca.topCategories')}</CardTitle>
          <p className="text-xs text-slate-500">{t('common.total')}: {grandTotal} | {t('common.records')}: {data?.total_records || 0}</p>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {/* Info Tip Box */}
          <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-blue-50 border border-blue-100">
            <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700 leading-relaxed">
              {t('analysis.tipCategory') || 'Data tabel ini diperoleh dari perhitungan total jumlah defect per kategori (Stitching, Logo, Material, dll) dari seluruh baris Daily Report FQC pada rentang tanggal yang dipilih. PPM dihitung berdasarkan jumlah defect per kategori terhadap total 1 juta unit yang diinspeksi.'}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Pie Chart */}
            <div className="min-h-[280px]">
              {loading ? (
                <Skeleton className="h-[280px] w-full rounded-lg" />
              ) : categoryChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={categoryChartData}
                      dataKey="defectCount"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      innerRadius={40}
                      paddingAngle={2}
                    >
                      {categoryChartData.map((_: any, index: number) => (
                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-sm text-slate-400">{t('common.noData')}</div>
              )}
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
                  {loading ? (
                    Array.from({ length: 9 }).map((_, i) => (
                      <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                    ))
                  ) : categorySummary.length > 0 ? (
                    categorySummary.map((c: any, i: number) => {
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
                    })
                  ) : (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-sm text-slate-400">{t('common.noData')}</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section B: Top 20 Sub-Defects — Horizontal Bar + Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">B. {t('rca.subDefects')} {t('analysis.top20')}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {/* Info Tip Box */}
          <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-amber-50 border border-amber-100">
            <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 leading-relaxed">
              {t('analysis.tipSubDefect') || 'Sub-defect menampilkan detail jenis defect spesifik (misalnya: skip stitch, loose thread, color deviation) yang dikelompokkan dalam setiap kategori defect. Data diambil dari kolom sub-defect individual pada Daily Report FQC.'}
            </p>
          </div>

          {/* Horizontal Bar Chart */}
          <div className="min-h-[350px] mb-4">
            {loading ? (
              <Skeleton className="h-[350px] w-full rounded-lg" />
            ) : subDefectChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(350, subDefectChartData.length * 28)}>
                <BarChart data={subDefectChartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="label" width={180} tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {subDefectChartData.map((_: any, index: number) => (
                      <Cell key={index} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">{t('common.noData')}</div>
            )}
          </div>

          {/* Table */}
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
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                  ))
                ) : topSubDefects.length > 0 ? (
                  topSubDefects.map((s: any, i: number) => (
                    <TableRow key={i} className="hover:bg-slate-50">
                      <TableCell className="text-xs font-medium text-slate-500">{i + 1}</TableCell>
                      <TableCell className="text-xs font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
                          {s.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">{s.category}</TableCell>
                      <TableCell className="text-xs text-right font-medium">{s.count}</TableCell>
                      <TableCell className="text-xs text-right">{s.percentage}%</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-sm text-slate-400">{t('common.noData')}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section C: Top 15 Styles — Bar Chart + Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">C. {t('rca.topStyles')} {t('analysis.top15')}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {/* Info Tip Box */}
          <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-rose-50 border border-rose-100">
            <Info className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />
            <p className="text-xs text-rose-700 leading-relaxed">
              {t('analysis.tipStyle') || 'Tabel ini menunjukkan 15 style (nomor model) dengan jumlah defect tertinggi. Defect Rate dihitung dari (total defect pada style tersebut / total kuantitas yang diinspeksi pada style tersebut) x 100%. Style dengan defect rate > 5% ditandai merah sebagai perhatian khusus.'}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Defect Count Bar Chart */}
            <div className="min-h-[300px]">
              {loading ? (
                <Skeleton className="h-[300px] w-full rounded-lg" />
              ) : styleChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={styleChartData} margin={{ left: 10, right: 20, top: 5, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="defectCount" fill="#2563eb" radius={[4, 4, 0, 0]} name="defectCount" />
                    <Bar dataKey="defectRate" fill="#ef4444" radius={[4, 4, 0, 0]} name="defectRate" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-sm text-slate-400">{t('common.noData')}</div>
              )}
            </div>

            {/* Table */}
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
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                    ))
                  ) : topStyles.length > 0 ? (
                    topStyles.map((s: any, i: number) => (
                      <TableRow key={i} className="hover:bg-slate-50">
                        <TableCell className="text-xs font-medium text-slate-500">{i + 1}</TableCell>
                        <TableCell className="text-xs font-medium">{s.style}</TableCell>
                        <TableCell className="text-xs text-right font-medium">{s.defectCount}</TableCell>
                        <TableCell className="text-xs text-right">{s.totalInspected.toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-right">
                          <span className={s.defectRate > 5 ? 'text-red-600 font-medium' : ''}>{s.defectRate}%</span>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
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
