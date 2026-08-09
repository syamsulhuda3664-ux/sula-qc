'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useBusinessTypeLock } from '@/contexts/BusinessTypeContext';
import { useDateFilter } from '@/contexts/DateFilterContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Download, RefreshCw } from 'lucide-react';

export default function OQCLotsPage() {
  const { t } = useI18n();
  const { effectiveType, isLocked } = useBusinessTypeLock();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const { dateFrom, dateTo, setDateFrom, setDateTo, clearDates } = useDateFilter();
  const [businessType, setBusinessType] = useState('ALL');
  const [disposition, setDisposition] = useState('ALL');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: '50' });
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const bt = effectiveType || businessType;
      if (bt !== 'ALL') params.set('business_type', bt);
      if (disposition !== 'ALL') params.set('disposition', disposition);

      const res = await fetch(`/api/oqc/lots?${params}`);
      if (res.ok) setData(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, dateFrom, dateTo, businessType, effectiveType, disposition]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const lots = data?.lots || [];
  const summary = data?.summary || {};
  const pagination = data?.pagination || {};

  const handleExport = async () => {
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'oqc-combined', filters: { date_from: dateFrom, date_to: dateTo, business_type: effectiveType || businessType, disposition } }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SULA-QC_OQC_Report_${dateFrom || 'all'}_${dateTo || 'all'}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // ignore
    }
  };

  const dispositionColor = (d: string) => {
    if (d === 'RELEASE') return 'border-emerald-300 text-emerald-700 bg-emerald-50';
    if (d === 'REWORK') return 'border-amber-300 text-amber-700 bg-amber-50';
    if (d === 'HOLD') return 'border-red-300 text-red-700 bg-red-50';
    return '';
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('common.from')}</label>
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="h-9" />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('common.to')}</label>
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="h-9" />
            </div>
            <div className="w-full sm:w-36">
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('fqc.businessType')}</label>
              <Select value={businessType} onValueChange={(v) => { setBusinessType(v); setPage(1); }} disabled={isLocked}>
                <SelectTrigger className="h-9" disabled={isLocked}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('common.all')}</SelectItem>
                  <SelectItem value="PTOEM">PTOEM</SelectItem>
                  <SelectItem value="PTB2C">PTB2C</SelectItem>
                  <SelectItem value="PTGH">PTGH</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-36">
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('oqc.disposition')}</label>
              <Select value={disposition} onValueChange={(v) => { setDisposition(v); setPage(1); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('common.all')}</SelectItem>
                  <SelectItem value="RELEASE">{t('disposition.release')}</SelectItem>
                  <SelectItem value="REWORK">{t('disposition.rework')}</SelectItem>
                  <SelectItem value="HOLD">{t('disposition.hold')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={() => { clearDates(); setBusinessType('ALL'); setDisposition('ALL'); setPage(1); }} className="h-9">
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> {t('action.reset')}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} className="h-9">
              <Download className="h-3.5 w-3.5 mr-1" /> {t('action.download')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-3 text-center">
          <p className="text-xs text-slate-500">{t('oqc.lotSize')}</p>
          <p className="text-lg font-bold">{(summary.total_lot_size || 0).toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xs text-slate-500">{t('oqc.sampleSize')}</p>
          <p className="text-lg font-bold">{(summary.total_sample_size || 0).toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xs text-slate-500">{t('oqc.totalDefects')}</p>
          <p className="text-lg font-bold text-red-600">{summary.total_defects || 0}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xs text-slate-500">{t('oqc.disposition')}</p>
          <div className="flex gap-1 justify-center mt-1">
            <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50 text-xs">R:{summary.release_count || 0}</Badge>
            <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50 text-xs">W:{summary.rework_count || 0}</Badge>
            <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50 text-xs">H:{summary.hold_count || 0}</Badge>
          </div>
        </CardContent></Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50">
                <TableRow>
                  <TableHead className="text-xs">{t('common.date')}</TableHead>
                  <TableHead className="text-xs">{t('fqc.businessType')}</TableHead>
                  <TableHead className="text-xs">{t('oqc.lotSize')}</TableHead>
                  <TableHead className="text-xs">{t('oqc.aqlCode')}</TableHead>
                  <TableHead className="text-xs text-right">{t('oqc.sampleSize')}</TableHead>
                  <TableHead className="text-xs text-right">Ac</TableHead>
                  <TableHead className="text-xs text-right">Re</TableHead>
                  <TableHead className="text-xs text-right">{t('oqc.criticalDefects')}</TableHead>
                  <TableHead className="text-xs text-right">{t('oqc.majorDefects')}</TableHead>
                  <TableHead className="text-xs text-right">{t('oqc.minorDefects')}</TableHead>
                  <TableHead className="text-xs text-right">{t('oqc.totalDefects')}</TableHead>
                  <TableHead className="text-xs text-right">{t('oqc.sampleOk')}</TableHead>
                  <TableHead className="text-xs text-right">{t('oqc.passRate')}</TableHead>
                  <TableHead className="text-xs">{t('oqc.disposition')}</TableHead>
                  <TableHead className="text-xs">{t('fqc.remark')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 15 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-10" /></TableCell>
                    ))}</TableRow>
                  ))
                ) : lots.length > 0 ? (
                  lots.map((lot: any, i: number) => (
                    <TableRow key={i} className="hover:bg-slate-50">
                      <TableCell className="text-xs">{lot.lot_date?.split('T')[0]}</TableCell>
                      <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{lot.business_type || '-'}</Badge></TableCell>
                      <TableCell className="text-xs">{lot.lot_size}</TableCell>
                      <TableCell className="text-xs font-mono">{lot.aql_code}</TableCell>
                      <TableCell className="text-xs text-right">{lot.sample_size}</TableCell>
                      <TableCell className="text-xs text-right">{lot.ac}</TableCell>
                      <TableCell className="text-xs text-right">{lot.re}</TableCell>
                      <TableCell className="text-xs text-right text-red-600 font-medium">{lot.critical_defects || 0}</TableCell>
                      <TableCell className="text-xs text-right text-amber-600 font-medium">{lot.major_defects || 0}</TableCell>
                      <TableCell className="text-xs text-right">{lot.minor_defects || 0}</TableCell>
                      <TableCell className="text-xs text-right font-medium">{lot.total_defects || 0}</TableCell>
                      <TableCell className="text-xs text-right text-emerald-600">{lot.sample_ok || 0}</TableCell>
                      <TableCell className="text-xs text-right font-medium">
                        <span className={(lot.pass_rate || 0) < 98 ? 'text-red-600' : ''}>{lot.pass_rate}%</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className={dispositionColor(lot.disposition)}>
                          {t(`disposition.${lot.disposition?.toLowerCase()}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">{lot.remarks || '-'}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={15} className="text-center py-12 text-sm text-slate-400">{t('common.noData')}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-slate-500">
                {t('common.showing')} {((page - 1) * 50 + 1)}-{Math.min(page * 50, pagination.total_count)} {t('common.of')} {pagination.total_count}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-8 text-xs">{t('action.prev')}</Button>
                <Button variant="outline" size="sm" disabled={page >= pagination.total_pages} onClick={() => setPage(page + 1)} className="h-8 text-xs">{t('action.next')}</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
