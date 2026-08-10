'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useBusinessTypeLock } from '@/contexts/BusinessTypeContext';
import { useDateFilter } from '@/contexts/DateFilterContext';
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
import { RefreshCw, Scissors, Wrench, Layers, Sparkles, Info, Download, Loader2 } from 'lucide-react';

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

const sessionLabels = ['', 'Ke-1', 'Ke-2', 'Ke-3', 'Ke-4', 'Ke-5'];

export default function IPQCPage() {
  const { t } = useI18n();
  const { effectiveType, isLocked } = useBusinessTypeLock();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const { dateFrom, dateTo, setDateFrom, setDateTo, clearDates } = useDateFilter();
  const [businessType, setBusinessType] = useState('ALL');
  const [line, setLine] = useState('');
  const [stage, setStage] = useState('ALL');
  const [orderNo, setOrderNo] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: '200' });
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const bt = effectiveType || businessType;
      if (bt !== 'ALL') params.set('business_type', bt);
      if (line) params.set('production_line', line);
      if (stage !== 'ALL') params.set('stage', stage);
      if (orderNo) params.set('order_no', orderNo);

      const res = await fetch(`/api/ipqc?${params}`);
      if (res.ok) setData(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, dateFrom, dateTo, businessType, effectiveType, line, stage, orderNo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const bt = effectiveType || businessType;

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const filters: Record<string, string> = {};
      if (dateFrom) filters.date_from = dateFrom;
      if (dateTo) filters.date_to = dateTo;
      if (bt !== 'ALL') filters.business_type = bt;
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ipqc', filters }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); alert(err.error || 'Export failed'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      const period = dateFrom ? `${dateFrom}_${dateTo || 'all'}` : 'All';
      a.download = `SULA-QC_IPQC_${period}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (err: any) { alert(err.message || 'Export failed'); } finally { setExporting(false); }
  };

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
            <div className="w-full sm:w-28">
              <label className="text-xs font-medium text-slate-600 mb-1 block">Order No</label>
              <Input value={orderNo} onChange={(e) => { setOrderNo(e.target.value); setPage(1); }} placeholder="Order" className="h-9" />
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
            <Button size="sm" onClick={handleExport} disabled={exporting || loading} className="h-9 bg-blue-600 hover:bg-blue-700 text-white">
              {exporting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />}{t('action.download')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { clearDates(); setBusinessType('ALL'); setLine(''); setStage('ALL'); setOrderNo(''); setPage(1); }} className="h-9">
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> {t('action.reset')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* How to read guide */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-700 leading-relaxed">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium mb-1">Cara membaca laporan IPQC:</p>
            <ul className="list-disc ml-4 space-y-0.5">
              <li>Setiap order diperiksa <strong>5 kali sehari</strong> (Sesi Ke-1 s/d Ke-5, setiap ~2 jam).</li>
              <li>Setiap sesi memeriksa <strong>komponen spesifik</strong> pada proses tertentu (Cutting / Sewing / Assembly / Finishing).</li>
              <li>Kolom <strong>Ditemukan</strong> berisi temuan defect jika ada, kolom <strong>Tindak Lanjut & Hasil</strong> berisi aksi perbaikan yang sudah dilakukan.</li>
              <li>Data di-generate otomatis saat upload FQC Daily berdasarkan nomor order dan tanggal pemeriksaan.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Stage Summary Cards */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STAGES.map((s) => {
            const sd = subtotals.by_stage?.[s] || { sessions: 0, checked: 0, pass: 0, fail: 0, findings: 0, pass_rate: 0 };
            return (
              <Card key={s} className={`border ${stageColors[s]?.split(' ').slice(1).join(' ') || ''}`}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={stageColors[s]?.split(' ')[0]}>{stageIcons[s]}</span>
                    <span className="text-xs font-medium">{t(`ipqc.stage.${s.toLowerCase()}`)}</span>
                  </div>
                  <p className="text-lg font-bold">{sd.sessions}</p>
                  <p className="text-xs text-slate-500">{t('oqc.passRate')}: <span className="font-medium text-emerald-600">{sd.pass_rate}%</span></p>
                  <p className="text-xs text-slate-400">{sd.findings} temuan</p>
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
                  <TableHead className="text-xs">Order No</TableHead>
                  <TableHead className="text-xs">Sesi</TableHead>
                  <TableHead className="text-xs">Proses</TableHead>
                  <TableHead className="text-xs">Komponen yang Dicek</TableHead>
                  <TableHead className="text-xs text-right">Cek</TableHead>
                  <TableHead className="text-xs text-right">OK</TableHead>
                  <TableHead className="text-xs text-right">NG</TableHead>
                  <TableHead className="text-xs">Ditemukan</TableHead>
                  <TableHead className="text-xs">Tindak Lanjut & Hasil</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 10 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                    ))}</TableRow>
                  ))
                ) : records.length > 0 ? (
                  records.map((r: any, i: number) => (
                    <TableRow key={r.id || i} className={`hover:bg-slate-50 ${r.finding ? 'bg-red-50/30' : ''}`}>
                      <TableCell className="text-xs whitespace-nowrap">{r.inspection_date?.split('T')[0]}</TableCell>
                      <TableCell className="text-xs font-medium whitespace-nowrap">{r.order_no}</TableCell>
                      <TableCell className="text-xs">
                        <span className="inline-flex items-center justify-center w-10 h-5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                          {sessionLabels[r.session_no] || `${r.session_no}`}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${stageColors[r.process_stage] || ''}`}>
                          {stageIcons[r.process_stage]} {t(`ipqc.stage.${(r.process_stage || '').toLowerCase()}`)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px]">{r.component_checked || '-'}</TableCell>
                      <TableCell className="text-xs text-right">{r.check_count}</TableCell>
                      <TableCell className="text-xs text-right text-emerald-600">{r.ok_count}</TableCell>
                      <TableCell className="text-xs text-right font-medium">{r.ng_count > 0 ? <span className="text-red-600">{r.ng_count}</span> : '0'}</TableCell>
                      <TableCell className="text-xs max-w-[200px]">{r.finding ? <span className="text-red-600">{r.finding}</span> : <span className="text-slate-300">-</span>}</TableCell>
                      <TableCell className="text-xs max-w-[250px]">{r.action_taken || <span className="text-slate-300">-</span>}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-sm text-slate-400">{t('common.noData')}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-slate-500">
                {t('common.showing')} {((page - 1) * 200 + 1)}-{Math.min(page * 200, pagination.total_count)} {t('common.of')} {pagination.total_count}
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
