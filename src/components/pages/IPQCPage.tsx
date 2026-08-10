'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useBusinessTypeLock } from '@/contexts/BusinessTypeContext';
import { useDateFilter } from '@/contexts/DateFilterContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Scissors, Wrench, Layers, Sparkles, Info, Download, Loader2, ClipboardCheck } from 'lucide-react';

const STAGES = ['Cutting', 'Sewing', 'Assembly', 'Finishing'];

const stageIcons: Record<string, React.ReactNode> = {
  Cutting: <Scissors className="h-3.5 w-3.5" />,
  Sewing: <Wrench className="h-3.5 w-3.5" />,
  Assembly: <Layers className="h-3.5 w-3.5" />,
  Finishing: <Sparkles className="h-3.5 w-3.5" />,
};

const stageColors: Record<string, string> = {
  Cutting: 'bg-blue-50 text-blue-700 border-blue-200',
  Sewing: 'bg-amber-50 text-amber-700 border-amber-200',
  Assembly: 'bg-purple-50 text-purple-700 border-purple-200',
  Finishing: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const stageBgColors: Record<string, string> = {
  Cutting: 'border-l-blue-400',
  Sewing: 'border-l-amber-400',
  Assembly: 'border-l-purple-400',
  Finishing: 'border-l-emerald-400',
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
      const params = new URLSearchParams({ page: String(page), page_size: '500' });
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

  // Group records by (date + order_no) for per-order display
  const groupedOrders = useMemo(() => {
    const groups: Record<string, { date: string; orderNo: string; bt: string; style: string; line: string; inspector: string; records: any[] }> = {};
    for (const r of records) {
      const key = `${r.inspection_date?.split('T')[0]}__${r.order_no}`;
      if (!groups[key]) {
        groups[key] = {
          date: r.inspection_date?.split('T')[0] || '',
          orderNo: r.order_no || '',
          bt: r.business_type || '',
          style: r.style_code || '',
          line: r.production_line || '',
          inspector: r.inspector_name || '',
          records: [],
        };
      }
      groups[key].records.push(r);
    }
    // Sort each group's records by session_no
    for (const g of Object.values(groups)) {
      g.records.sort((a: any, b: any) => (a.session_no || 0) - (b.session_no || 0));
    }
    // Sort groups by date desc, order_no asc
    return Object.values(groups).sort((a, b) => {
      const dateComp = b.date.localeCompare(a.date);
      if (dateComp !== 0) return dateComp;
      return a.orderNo.localeCompare(b.orderNo);
    });
  }, [records]);

  // Summary stats for the page
  const totalFindings = useMemo(() => records.filter((r: any) => r.finding).length, [records]);
  const totalNG = useMemo(() => records.reduce((s: number, r: any) => s + (Number(r.ng_count) || 0), 0), [records]);
  const totalChecked = useMemo(() => records.reduce((s: number, r: any) => s + (Number(r.check_count) || 0), 0), [records]);

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
              <li>Setiap sesi memeriksa <strong>1 komponen spesifik</strong> pada 1 proses (Cutting / Sewing / Assembly / Finishing).</li>
              <li>Kolom <strong>Ditemukan</strong>: temuan defect jika ada. Kolom <strong>Tindak Lanjut & Hasil</strong>: aksi perbaikan yang sudah dilakukan beserta hasilnya.</li>
              <li>Proses yang dicek bergantung pada order — tidak semua order melewati semua tahap (misalnya yang hanya sewing + assembly tidak akan ada cutting).</li>
              <li>Data di-generate otomatis saat upload FQC Daily berdasarkan nomor order dan tanggal pemeriksaan.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Summary Stats Row */}
      {!loading && records.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-slate-200">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-100"><ClipboardCheck className="h-4 w-4 text-slate-600" /></div>
              <div>
                <p className="text-lg font-bold">{groupedOrders.length}</p>
                <p className="text-xs text-slate-500">Order diperiksa</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-50"><Sparkles className="h-4 w-4 text-emerald-600" /></div>
              <div>
                <p className="text-lg font-bold">{totalChecked}</p>
                <p className="text-xs text-slate-500">Total dicek</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-50"><Layers className="h-4 w-4 text-red-600" /></div>
              <div>
                <p className="text-lg font-bold text-red-600">{totalNG}</p>
                <p className="text-xs text-slate-500">Total NG</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-50"><Wrench className="h-4 w-4 text-orange-600" /></div>
              <div>
                <p className="text-lg font-bold text-orange-600">{totalFindings}</p>
                <p className="text-xs text-slate-500">Sesi ada temuan</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Per-Order Cards */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4 space-y-3">
              <Skeleton className="h-5 w-64" />
              <Skeleton className="h-40 w-full" />
            </CardContent></Card>
          ))}
        </div>
      ) : groupedOrders.length > 0 ? (
        <div className="space-y-4">
          {groupedOrders.map((group, gi) => {
            const groupNG = group.records.reduce((s: number, r: any) => s + (Number(r.ng_count) || 0), 0);
            const groupFindings = group.records.filter((r: any) => r.finding).length;
            const groupChecked = group.records.reduce((s: number, r: any) => s + (Number(r.check_count) || 0), 0);

            return (
              <Card key={`${group.date}__${group.orderNo}__${gi}`} className="overflow-hidden">
                {/* Order Header */}
                <CardHeader className="pb-2 pt-3 px-4 bg-slate-50 border-b">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <CardTitle className="text-sm font-bold">{group.orderNo}</CardTitle>
                    <span className="text-xs text-slate-500">{group.date}</span>
                    {group.style && <Badge variant="outline" className="text-[10px] h-5">{group.style}</Badge>}
                    {group.bt && <Badge variant="outline" className="text-[10px] h-5">{group.bt.replace('PT', '')}</Badge>}
                    {group.line && <span className="text-[10px] text-slate-400">Line: {group.line}</span>}
                    {group.inspector && <span className="text-[10px] text-slate-400">Inspector: {group.inspector}</span>}
                    <div className="ml-auto flex items-center gap-3 text-[10px]">
                      <span className="text-slate-500">Dicek: <strong>{groupChecked}</strong></span>
                      <span className="text-red-600">NG: <strong>{groupNG}</strong></span>
                      {groupFindings > 0 && <span className="text-orange-600">{groupFindings} temuan</span>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-white hover:bg-white">
                          <TableHead className="text-[10px] w-14">Sesi</TableHead>
                          <TableHead className="text-[10px]">Proses</TableHead>
                          <TableHead className="text-[10px]">Komponen yang Dicek</TableHead>
                          <TableHead className="text-[10px] text-right w-12">Cek</TableHead>
                          <TableHead className="text-[10px] text-right w-12">OK</TableHead>
                          <TableHead className="text-[10px] text-right w-12">NG</TableHead>
                          <TableHead className="text-[10px]">Ditemukan</TableHead>
                          <TableHead className="text-[10px]">Tindak Lanjut & Hasil</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.records.map((r: any, ri: number) => (
                          <TableRow
                            key={r.id || ri}
                            className={`hover:bg-slate-50/50 border-l-2 ${stageBgColors[r.process_stage] || 'border-l-slate-200'} ${r.finding ? 'bg-red-50/20' : ''}`}
                          >
                            <TableCell className="text-xs">
                              <span className="inline-flex items-center justify-center w-10 h-5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                                {sessionLabels[r.session_no] || `${r.session_no}`}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs">
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${stageColors[r.process_stage] || ''}`}>
                                {stageIcons[r.process_stage]} {t(`ipqc.stage.${(r.process_stage || '').toLowerCase()}`)}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs max-w-[220px]">{r.component_checked || '-'}</TableCell>
                            <TableCell className="text-xs text-right">{r.check_count}</TableCell>
                            <TableCell className="text-xs text-right text-emerald-600">{r.ok_count}</TableCell>
                            <TableCell className="text-xs text-right font-medium">
                              {r.ng_count > 0 ? <span className="text-red-600">{r.ng_count}</span> : '0'}
                            </TableCell>
                            <TableCell className="text-xs max-w-[220px]">
                              {r.finding
                                ? <span className="text-red-600 leading-snug">{r.finding}</span>
                                : <span className="text-slate-300">-</span>}
                            </TableCell>
                            <TableCell className="text-xs max-w-[250px]">
                              {r.action_taken
                                ? <span className="text-slate-700 leading-snug">{r.action_taken}</span>
                                : <span className="text-slate-300">-</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardCheck className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">{t('common.noData')}</p>
            <p className="text-xs text-slate-300 mt-1">IPQC data akan muncul setelah FQC Daily di-upload</p>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {!loading && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-slate-500">
            {t('common.showing')} {groupedOrders.length} order {t('common.of')} {Math.ceil((pagination.total_count || 0) / 5)} orders
          </p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-8 text-xs">{t('action.prev')}</Button>
            <Button variant="outline" size="sm" disabled={page >= pagination.total_pages} onClick={() => setPage(page + 1)} className="h-8 text-xs">{t('action.next')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
