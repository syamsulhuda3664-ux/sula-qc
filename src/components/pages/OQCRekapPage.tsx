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
import { CheckCircle2, AlertTriangle, XCircle, Package, TrendingUp, FileText } from 'lucide-react';

const OQC_CAT_ZH: Record<string, string> = {
  Packaging: '包装问题 / Packaging',
  Label: '标签问题 / Label',
  Accessory: '配件问题 / Accessory',
  Appearance: '外观问题 / Appearance',
  Hardware: '五金问题 / Hardware',
  Stitching: '缝制问题 / Stitching',
  Other: '其它问题 / Other',
};

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
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [period, value, businessType, effectiveType]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const s = data?.summary || {};
  const daily = data?.daily_breakdown || [];
  const defCats = data?.defect_categories || [];
  const totalDefects = s.total_defects || 0;

  const periodTitle = period === 'month'
    ? `${value}-${t('oqc.rekapMonthlyReport')}`
    : period === 'quarter'
      ? `${value} ${isZh ? '季度' : 'Q'} ${t('oqc.rekapQuarterlyReport')}`
      : `${value} ${t('oqc.rekapAnnualReport')}`;

  const statusColor = (s.pass_rate || 0) >= 98 ? 'text-emerald-600' : (s.pass_rate || 0) >= 95 ? 'text-amber-600' : 'text-red-600';
  const statusBg = (s.pass_rate || 0) >= 98 ? 'bg-emerald-50 border-emerald-200' : (s.pass_rate || 0) >= 95 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';
  const statusText = (s.pass_rate || 0) >= 98 ? 'PASS' : (s.pass_rate || 0) >= 95 ? 'WATCH' : 'FAIL';

  const dispBadge = (d: string) => {
    if (d === 'RELEASE') return <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">{t('disposition.release')}</Badge>;
    if (d === 'REWORK') return <Badge className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">{t('disposition.rework')}</Badge>;
    if (d === 'HOLD') return <Badge className="text-[10px] bg-red-50 text-red-700 border-red-200">{t('disposition.hold')}</Badge>;
    return '-';
  };

  return (
    <div className="space-y-4">
      {/* ── Period Selector ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <Tabs value={period} onValueChange={setPeriod}>
              <TabsList className="bg-slate-100">
                <TabsTrigger value="month" className="text-xs">{t('time.thisMonth')}</TabsTrigger>
                <TabsTrigger value="quarter" className="text-xs">{t('time.thisQuarter')}</TabsTrigger>
                <TabsTrigger value="year" className="text-xs">{t('time.thisYear')}</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="w-full sm:w-40">
              <Input type={period === 'year' ? 'number' : 'month'} value={value}
                onChange={(e) => setValue(e.target.value)} min={period === 'year' ? '2020' : undefined} className="h-9" />
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
          </div>
        </CardContent>
      </Card>

      {/* ── Report Header ── */}
      <Card className="border-l-4 border-l-blue-500">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-800">OQC {t('oqc.rekapMonthlyReport')} · {periodTitle}</h2>
          </div>
          <p className="text-[10px] text-slate-400">Xiamen Xinweifa Industrial Co., Ltd. · Outgoing Quality Control · ANSI/ASQ Z1.4 Level II Normal @ AQL 2.5 · {isZh ? '目标合格率 ≥ 98.00%' : 'Target Pass Rate ≥ 98.00%'}</p>
        </CardContent>
      </Card>

      {/* ── Summary KPI Row (like Excel row 5-6) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <p className="text-[10px] text-slate-500 uppercase">{isZh ? '检验批次数' : 'Lots Inspected'}</p>
            <p className="text-xl font-bold text-slate-800">{s.total_lots || 0} <span className="text-xs font-normal text-slate-400">lots</span></p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-indigo-500">
          <CardContent className="p-3">
            <p className="text-[10px] text-slate-500 uppercase">{isZh ? '抽样总数' : 'Total Sample'}</p>
            <p className="text-xl font-bold text-slate-800">{(s.total_sampled || 0).toLocaleString()} <span className="text-xs font-normal text-slate-400">pcs</span></p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-3">
            <p className="text-[10px] text-slate-500 uppercase">{t('dashboard.totalPassRate')}</p>
            <p className={`text-xl font-bold ${statusColor}`}>{s.pass_rate || 0}%</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-3">
            <p className="text-[10px] text-slate-500 uppercase">{isZh ? '放行/返工/扣留' : 'Release / Rework / Hold'}</p>
            <div className="flex gap-2 mt-1">
              <span className="text-sm font-bold text-emerald-600">{s.release_lots || 0}</span>
              <span className="text-slate-300">/</span>
              <span className="text-sm font-bold text-amber-600">{s.rework_lots || 0}</span>
              <span className="text-slate-300">/</span>
              <span className="text-sm font-bold text-red-600">{s.hold_lots || 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── A. Daily Data Table (like Excel rows 9-33) ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            A. {isZh ? '每日数据' : 'Daily Data'} / {t('common.detail')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="text-[10px]">No</TableHead>
                  <TableHead className="text-[10px]">{t('common.date')}</TableHead>
                  <TableHead className="text-[10px] text-right">{t('common.lots')}</TableHead>
                  <TableHead className="text-[10px] text-right">{t('oqc.lotSize')}</TableHead>
                  <TableHead className="text-[10px] text-right">{t('oqc.sampleSize')}</TableHead>
                  <TableHead className="text-[10px] text-right">Ac</TableHead>
                  <TableHead className="text-[10px] text-right">Re</TableHead>
                  <TableHead className="text-[10px] text-right text-red-600">{t('oqc.criticalDefects')}</TableHead>
                  <TableHead className="text-[10px] text-right text-amber-600">{t('oqc.majorDefects')}</TableHead>
                  <TableHead className="text-[10px] text-right">{t('oqc.minorDefects')}</TableHead>
                  <TableHead className="text-[10px] text-right font-bold">{t('oqc.totalDefects')}</TableHead>
                  <TableHead className="text-[10px] text-right">{t('oqc.sampleOk')}</TableHead>
                  <TableHead className="text-[10px] text-right">{t('oqc.passRate')}</TableHead>
                  <TableHead className="text-[10px] text-right">{t('disposition.release')}</TableHead>
                  <TableHead className="text-[10px] text-right">{t('disposition.rework')}</TableHead>
                  <TableHead className="text-[10px] text-right">{t('disposition.hold')}</TableHead>
                  <TableHead className="text-[10px] text-center">{t('oqc.disposition')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={18}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                  ))
                ) : daily.length > 0 ? (
                  <>
                    {daily.map((d: any, i: number) => (
                      <TableRow key={i} className="hover:bg-slate-50 text-xs">
                        <TableCell className="text-slate-400">{i + 1}</TableCell>
                        <TableCell className="whitespace-nowrap">{d.lot_date}</TableCell>
                        <TableCell className="text-right">{d.lot_count}</TableCell>
                        <TableCell className="text-right font-medium">{d.lot_size.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{d.sample_size.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-slate-500">{d.ac || '-'}</TableCell>
                        <TableCell className="text-right text-slate-500">{d.re_val || '-'}</TableCell>
                        <TableCell className="text-right text-red-700 font-bold">{d.critical || 0}</TableCell>
                        <TableCell className="text-right text-amber-700 font-bold">{d.major || 0}</TableCell>
                        <TableCell className="text-right">{d.minor || 0}</TableCell>
                        <TableCell className="text-right font-bold text-red-600">{d.defects}</TableCell>
                        <TableCell className="text-right">{d.sample_ok.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <span className={d.pass_rate < 98 ? 'text-red-600 font-bold' : d.pass_rate < 98.5 ? 'text-amber-600' : 'text-emerald-600'}>
                            {d.pass_rate}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-emerald-600">{d.release_qty > 0 ? d.release_qty.toLocaleString() : '-'}</TableCell>
                        <TableCell className="text-right text-amber-600">{d.rework_qty > 0 ? d.rework_qty.toLocaleString() : '-'}</TableCell>
                        <TableCell className="text-right text-red-600">{d.hold_qty > 0 ? d.hold_qty.toLocaleString() : '-'}</TableCell>
                        <TableCell className="text-center">{dispBadge(d.disposition)}</TableCell>
                      </TableRow>
                    ))}
                    {/* Total row */}
                    <TableRow className="bg-slate-100 font-bold text-xs">
                      <TableCell colSpan={2} className="text-slate-600">{isZh ? '合计 TOTAL' : 'TOTAL'}</TableCell>
                      <TableCell className="text-right">{daily.reduce((a: number, d: any) => a + (d.lot_count || 0), 0)}</TableCell>
                      <TableCell className="text-right">{(s.total_lot_size || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{(s.total_sampled || 0).toLocaleString()}</TableCell>
                      <TableCell /><TableCell />
                      <TableCell className="text-right text-red-700">{s.critical_defects || 0}</TableCell>
                      <TableCell className="text-right text-amber-700">{s.major_defects || 0}</TableCell>
                      <TableCell className="text-right">{s.minor_defects || 0}</TableCell>
                      <TableCell className="text-right text-red-600">{totalDefects}</TableCell>
                      <TableCell className="text-right">{(s.total_sample_ok || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <span className={statusColor}>{s.pass_rate || 0}%</span>
                      </TableCell>
                      <TableCell className="text-right text-emerald-600">{(s.release_qty || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right text-amber-600">{(s.rework_qty || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right text-red-600">{(s.hold_qty || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={`text-[10px] border ${statusBg}`}>{statusText}</Badge>
                      </TableCell>
                    </TableRow>
                  </>
                ) : (
                  <TableRow><TableCell colSpan={18} className="text-center py-12 text-sm text-slate-400">{t('common.noData')}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── B. Defect Category Summary (like Excel rows 37-46) ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            B. {isZh ? '缺陷分类汇总' : 'Defect Category Summary'} / {t('dashboard.defectDistribution')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="text-[10px] w-10">No</TableHead>
                  <TableHead className="text-[10px]">{isZh ? '缺陷类别' : 'Defect Category'}</TableHead>
                  <TableHead className="text-[10px] text-right">{isZh ? '严重' : 'Critical'}</TableHead>
                  <TableHead className="text-[10px] text-right">{isZh ? '主要' : 'Major'}</TableHead>
                  <TableHead className="text-[10px] text-right">{isZh ? '次要' : 'Minor'}</TableHead>
                  <TableHead className="text-[10px] text-right">{isZh ? '数量' : 'Count'}</TableHead>
                  <TableHead className="text-[10px] text-right">%</TableHead>
                  <TableHead className="text-[10px]">{isZh ? '典型缺陷 / 典型问题' : 'Typical Defects'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {defCats.length > 0 ? (
                  <>
                    {defCats.map((c: any, i: number) => (
                      <TableRow key={c.category} className="hover:bg-slate-50 text-xs">
                        <TableCell className="text-slate-400">{i + 1}</TableCell>
                        <TableCell className="font-medium whitespace-nowrap">
                          {isZh ? OQC_CAT_ZH[c.category] || c.category : c.category}
                        </TableCell>
                        <TableCell className="text-right text-red-700 font-bold">{c.critical || 0}</TableCell>
                        <TableCell className="text-right text-amber-700 font-bold">{c.major || 0}</TableCell>
                        <TableCell className="text-right">{c.minor || 0}</TableCell>
                        <TableCell className="text-right font-bold">{c.count}</TableCell>
                        <TableCell className="text-right text-slate-500">{c.percentage}%</TableCell>
                        <TableCell className="text-slate-600 max-w-xs">
                          <span className="text-[10px] leading-relaxed">
                            {isZh ? c.typical_defects?.zh : c.typical_defects?.en}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Total row */}
                    <TableRow className="bg-slate-100 font-bold text-xs">
                      <TableCell colSpan={2} className="text-slate-600">{isZh ? '合计 TOTAL' : 'TOTAL'}</TableCell>
                      <TableCell className="text-right text-red-700">{s.critical_defects || 0}</TableCell>
                      <TableCell className="text-right text-amber-700">{s.major_defects || 0}</TableCell>
                      <TableCell className="text-right">{s.minor_defects || 0}</TableCell>
                      <TableCell className="text-right">{totalDefects}</TableCell>
                      <TableCell className="text-right">100%</TableCell>
                      <TableCell />
                    </TableRow>
                  </>
                ) : (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-sm text-slate-400">{t('common.noData')}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
