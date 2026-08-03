'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useBusinessTypeLock } from '@/contexts/BusinessTypeContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RefreshCw, Scissors, Wrench, Layers, Sparkles } from 'lucide-react';

const STAGES = ['Cutting', 'Sewing', 'Assembly', 'Finishing'];

const stageIcons: Record<string, React.ReactNode> = {
  Cutting: <Scissors className="h-4 w-4" />,
  Sewing: <Wrench className="h-4 w-4" />,
  Assembly: <Layers className="h-4 w-4" />,
  Finishing: <Sparkles className="h-4 w-4" />,
};

const stageColors: Record<string, string> = {
  Cutting: 'bg-blue-50 text-blue-700 border-blue-200',
  Sewing: 'bg-amber-50 text-amber-700 border-amber-200',
  Assembly: 'bg-purple-50 text-purple-700 border-purple-200',
  Finishing: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export default function IPQCPage() {
  const { t } = useI18n();
  const { effectiveType, isLocked } = useBusinessTypeLock();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [businessType, setBusinessType] = useState('ALL');
  const [line, setLine] = useState('');
  const [stage, setStage] = useState('ALL');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: '100' });
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const bt = effectiveType || businessType;
      if (bt !== 'ALL') params.set('business_type', bt);
      if (line) params.set('production_line', line);
      if (stage !== 'ALL') params.set('stage', stage);

      const res = await fetch(`/api/ipqc?${params}`);
      if (res.ok) setData(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, dateFrom, dateTo, businessType, effectiveType, line, stage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const records = data?.records || [];
  const subtotals = data?.subtotals || {};
  const pagination = data?.pagination || {};

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-[130px]">
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('common.from')}</label>
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="h-9" />
            </div>
            <div className="flex-1 min-w-[130px]">
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
            <div className="w-full sm:w-32">
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('fqc.line')}</label>
              <Input value={line} onChange={(e) => { setLine(e.target.value); setPage(1); }} placeholder={t('fqc.line')} className="h-9" />
            </div>
            <div className="w-full sm:w-36">
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('ipqc.stage')}</label>
              <Select value={stage} onValueChange={(v) => { setStage(v); setPage(1); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('common.all')}</SelectItem>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>{t(`ipqc.stage.${s.toLowerCase()}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); setBusinessType('ALL'); setLine(''); setStage('ALL'); setPage(1); }} className="h-9">
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> {t('action.reset')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stage Summary Cards */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STAGES.map((s) => {
            const sd = subtotals.by_stage?.[s] || { count: 0, checked: 0, pass: 0, fail: 0, pass_rate: 0 };
            return (
              <Card key={s} className={`border ${stageColors[s]?.split(' ').slice(1).join(' ') || ''}`}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={stageColors[s]?.split(' ')[0]}>{stageIcons[s]}</span>
                    <span className="text-xs font-medium">{t(`ipqc.stage.${s.toLowerCase()}`)}</span>
                  </div>
                  <p className="text-lg font-bold">{sd.count}</p>
                  <p className="text-xs text-slate-500">{t('oqc.passRate')}: <span className="font-medium text-emerald-600">{sd.pass_rate}%</span></p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50">
                <TableRow>
                  <TableHead className="text-xs">{t('common.date')}</TableHead>
                  <TableHead className="text-xs">{t('fqc.line')}</TableHead>
                  <TableHead className="text-xs">{t('fqc.style')}</TableHead>
                  <TableHead className="text-xs">{t('fqc.orderNo')}</TableHead>
                  <TableHead className="text-xs">{t('ipqc.stage')}</TableHead>
                  <TableHead className="text-xs text-right">{t('ipqc.checked')}</TableHead>
                  <TableHead className="text-xs text-right">{t('ipqc.pass')}</TableHead>
                  <TableHead className="text-xs text-right">{t('ipqc.ng')}</TableHead>
                  <TableHead className="text-xs text-right">{t('oqc.passRate')}</TableHead>
                  <TableHead className="text-xs">{t('ipqc.defects')}</TableHead>
                  <TableHead className="text-xs">{t('fqc.remark')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 11 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-12" /></TableCell>
                    ))}</TableRow>
                  ))
                ) : records.length > 0 ? (
                  records.map((r: any, i: number) => (
                    <TableRow key={i} className="hover:bg-slate-50">
                      <TableCell className="text-xs">{r.inspection_date?.split('T')[0]}</TableCell>
                      <TableCell className="text-xs">{r.line}</TableCell>
                      <TableCell className="text-xs font-medium">{r.style}</TableCell>
                      <TableCell className="text-xs">{r.order_no}</TableCell>
                      <TableCell className="text-xs">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${stageColors[r.stage] || ''}`}>
                          {stageIcons[r.stage]} {t(`ipqc.stage.${r.stage.toLowerCase()}`)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-right">{r.checked_qty}</TableCell>
                      <TableCell className="text-xs text-right text-emerald-600">{r.pass_qty}</TableCell>
                      <TableCell className="text-xs text-right text-red-600">{r.fail_qty}</TableCell>
                      <TableCell className="text-xs text-right font-medium">
                        <span className={(r.pass_rate || 0) < 95 ? 'text-red-600' : ''}>{r.pass_rate}%</span>
                      </TableCell>
                      <TableCell className="text-xs">{r.defect_category || '-'}</TableCell>
                      <TableCell className="text-xs text-slate-400 max-w-[100px] truncate">{r.detail || '-'}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-12 text-sm text-slate-400">{t('common.noData')}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-slate-500">
                {t('common.showing')} {((page - 1) * 100 + 1)}-{Math.min(page * 100, pagination.total_count)} {t('common.of')} {pagination.total_count}
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
