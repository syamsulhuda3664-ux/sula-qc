'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { RefreshCw } from 'lucide-react';

export default function FQCAnalysisPage() {
  const { t } = useI18n();
  const { effectiveType, isLocked } = useBusinessTypeLock();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
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

  return (
    <div className="space-y-4">
      {/* Filters */}
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
          </div>
        </CardContent>
      </Card>

      {/* Section A: Category Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">A. {t('rca.topCategories')}</CardTitle>
          <p className="text-xs text-slate-500">{t('common.total')}: {grandTotal} | {t('common.records')}: {data?.total_records || 0}</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="text-xs w-10">#</TableHead>
                  <TableHead className="text-xs">{t('fqc.defectAnalysis')}</TableHead>
                  <TableHead className="text-xs text-right">{t('rca.defectCount')}</TableHead>
                  <TableHead className="text-xs text-right">{t('rca.percentage')}</TableHead>
                  <TableHead className="text-xs text-right">PPM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                  ))
                ) : categorySummary.length > 0 ? (
                  categorySummary.map((c: any, i: number) => {
                    const inspectedTotal = data?.total_records;
                    const ppm = inspectedTotal > 0 ? Math.round((c.defectCount / (inspectedTotal * 100)) * 1000000) : 0;
                    return (
                      <TableRow key={i} className="hover:bg-slate-50">
                        <TableCell className="text-xs font-medium text-slate-500">{i + 1}</TableCell>
                        <TableCell className="text-xs font-medium">{t(`defect.${c.categoryKey?.replace('defect_', '') || 'other'}`)}</TableCell>
                        <TableCell className="text-xs text-right font-medium">{c.defectCount}</TableCell>
                        <TableCell className="text-xs text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-red-400 rounded-full" style={{ width: `${Math.min(c.percentage, 100)}%` }} />
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
        </CardContent>
      </Card>

      {/* Section B: Top 20 Sub-Defects */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">B. {t('rca.subDefects')} (Top 20)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="text-xs w-10">#</TableHead>
                  <TableHead className="text-xs">{t('fqc.defectAnalysis')}</TableHead>
                  <TableHead className="text-xs">Category</TableHead>
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
                      <TableCell className="text-xs font-medium">{s.name}</TableCell>
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

      {/* Section C: Top 15 Styles */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">C. {t('rca.topStyles')} (Top 15)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
        </CardContent>
      </Card>
    </div>
  );
}
