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
import { Download, Search, RefreshCw, Loader2 } from 'lucide-react';
import { shortenLineName } from '@/lib/utils';

const DEFECT_COLS = [
  'defect_stitching', 'defect_logo', 'defect_material', 'defect_hardware',
  'defect_appearance', 'defect_zipper', 'defect_webbing', 'defect_other',
  'defect_preparation',
];

const DEFECT_KEYS = [
  'stitching', 'logo', 'material', 'hardware', 'appearance',
  'zipper', 'webbing', 'other', 'preparation',
];

export default function FQCDailyPage() {
  const { t } = useI18n();
  const { effectiveType, isLocked } = useBusinessTypeLock();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [businessType, setBusinessType] = useState('ALL');
  const [line, setLine] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: '100' });
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const bt = effectiveType || businessType;
      if (bt !== 'ALL') params.set('business_type', bt);
      if (line) params.set('production_line', line);

      const res = await fetch(`/api/fqc/inspections?${params}`);
      if (res.ok) setData(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, dateFrom, dateTo, businessType, effectiveType, line]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const bt = effectiveType || businessType;
      const filters: Record<string, string> = {};
      if (dateFrom) filters.date_from = dateFrom;
      if (dateTo) filters.date_to = dateTo;
      if (bt !== 'ALL') filters.business_type = bt;
      if (line) filters.production_line = line;

      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'fqc-daily', filters }),
      });
      if (!res.ok) {
        let errMsg = `Export failed (${res.status})`;
        try {
          const errBody = await res.json();
          if (errBody.error) errMsg = errBody.error;
        } catch {}
        alert(errMsg);
        return;
      }
      const blob = await res.blob();
      if (blob.size === 0) {
        alert('Export returned empty file');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fqc_daily_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Export error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
  };

  const records = data?.records || [];
  const subtotals = data?.subtotals || {};
  const pagination = data?.pagination || {};

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 min-w-0">
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('common.from')}</label>
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="h-9" />
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('common.to')}</label>
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="h-9" />
            </div>
            <div className="w-full sm:w-40">
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
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('fqc.line')}</label>
              <Input value={line} onChange={(e) => { setLine(e.target.value); setPage(1); }} placeholder={t('fqc.line')} className="h-9" />
            </div>
            <Button variant="outline" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); setBusinessType('ALL'); setLine(''); setPage(1); }} className="h-9">
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> {t('action.reset')}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting} className="h-9">
              {exporting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />} {t('action.download')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <Table className="table-fixed w-full">
              <TableHeader className="sticky top-0 z-10 bg-slate-50">
                <TableRow>
                  <TableHead className="text-xs w-9 whitespace-normal leading-tight text-center p-1.5">No</TableHead>
                  <TableHead className="text-xs w-[72px] whitespace-normal leading-tight p-1.5">{t('common.date')}</TableHead>
                  <TableHead className="text-xs w-11 whitespace-normal leading-tight text-center p-1.5">{t('fqc.line')}</TableHead>
                  <TableHead className="text-xs w-14 whitespace-normal leading-tight p-1.5">{t('fqc.inspector')}</TableHead>
                  <TableHead className="text-xs w-[76px] whitespace-normal leading-tight p-1.5">{t('fqc.style')}</TableHead>
                  <TableHead className="text-xs w-[72px] whitespace-normal leading-tight p-1.5">{t('fqc.orderNo')}</TableHead>
                  <TableHead className="text-xs w-[52px] whitespace-normal leading-tight text-right p-1.5">{t('fqc.orderQty')}</TableHead>
                  <TableHead className="text-xs w-[52px] whitespace-normal leading-tight text-right p-1.5">{t('fqc.inspectedQty')}</TableHead>
                  <TableHead className="text-xs w-10 whitespace-normal leading-tight text-right p-1.5">{t('fqc.okQty')}</TableHead>
                  <TableHead className="text-xs w-10 whitespace-normal leading-tight text-right p-1.5">{t('fqc.ngQty')}</TableHead>
                  <TableHead className="text-xs w-[52px] whitespace-normal leading-tight text-right p-1.5">{t('fqc.defectRate')}</TableHead>
                  {DEFECT_KEYS.map((key) => (
                    <TableHead key={key} className="text-xs w-11 whitespace-normal leading-tight text-right p-1.5">{t(`defect.${key}`)}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 15 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-12" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : records.length > 0 ? (
                  <>
                    {records.map((r: any, i: number) => (
                      <TableRow key={i} className="hover:bg-slate-50">
                        <TableCell className="text-xs text-slate-500 text-center p-1.5">{(page - 1) * 100 + i + 1}</TableCell>
                        <TableCell className="text-xs p-1.5">{r.inspection_date?.split('T')[0]}</TableCell>
                        <TableCell className="text-xs text-center font-medium p-1.5">{shortenLineName(r.line)}</TableCell>
                        <TableCell className="text-xs p-1.5">{r.inspector}</TableCell>
                        <TableCell className="text-xs font-medium p-1.5 truncate">{r.style}</TableCell>
                        <TableCell className="text-xs p-1.5 truncate">{r.order_no}</TableCell>
                        <TableCell className="text-xs text-right p-1.5">{r.order_qty}</TableCell>
                        <TableCell className="text-xs text-right p-1.5">{r.inspected_qty}</TableCell>
                        <TableCell className="text-xs text-right text-emerald-600 p-1.5">{r.ok_qty}</TableCell>
                        <TableCell className="text-xs text-right text-red-600 p-1.5">{r.ng_qty}</TableCell>
                        <TableCell className="text-xs text-right font-medium p-1.5">
                          <span className={Number(r.defect_rate) > 5 ? 'text-red-600' : 'text-slate-700'}>
                            {r.defect_rate}%
                          </span>
                        </TableCell>
                        {DEFECT_COLS.map((col) => (
                          <TableCell key={col} className="text-xs text-right p-1.5">
                            {Number(r[col]) > 0 ? <span className="text-red-500 font-medium">{r[col]}</span> : <span className="text-slate-300">0</span>}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {/* Subtotal Row */}
                    <TableRow className="bg-slate-100 font-medium">
                      <TableCell colSpan={6} className="text-xs font-semibold text-slate-700 p-1.5">{t('common.total')}</TableCell>
                      <TableCell className="text-xs text-right font-semibold p-1.5">{subtotals.total_order_qty}</TableCell>
                      <TableCell className="text-xs text-right font-semibold p-1.5">{subtotals.total_inspected_qty}</TableCell>
                      <TableCell className="text-xs text-right font-semibold text-emerald-700 p-1.5">{subtotals.total_ok_qty}</TableCell>
                      <TableCell className="text-xs text-right font-semibold text-red-700 p-1.5">{subtotals.total_ng_qty}</TableCell>
                      <TableCell className="text-xs text-right font-semibold p-1.5">{subtotals.avg_defect_rate}%</TableCell>
                      {DEFECT_COLS.map((col) => (
                        <TableCell key={col} className="text-xs text-right font-semibold p-1.5">
                          {(subtotals as any)[col] || 0}
                        </TableCell>
                      ))}
                    </TableRow>
                  </>
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
                {t('common.showing')} {((page - 1) * 100 + 1)}-{Math.min(page * 100, pagination.total_count)} {t('common.of')} {pagination.total_count} {t('common.entries')}
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
