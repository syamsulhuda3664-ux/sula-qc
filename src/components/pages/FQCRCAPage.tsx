'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useAuth } from '@/contexts/AuthContext';
import { useBusinessTypeLock } from '@/contexts/BusinessTypeContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Save, Loader2, AlertCircle, Plus, ChevronDown, ChevronRight,
  RefreshCw, CheckCircle2, XCircle, Clock, Camera, X, Image as ImageIcon,
} from 'lucide-react';

const MONTH_NAMES_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const MONTH_NAMES_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const BT_COLORS: Record<string, string> = {
  PTOEM: 'bg-blue-100 text-blue-700 border-blue-200',
  PTB2C: 'bg-violet-100 text-violet-700 border-violet-200',
  PTGH: 'bg-amber-100 text-amber-700 border-amber-200',
};

const BT_SHORT: Record<string, string> = {
  PTOEM: 'OEM',
  PTB2C: 'B2C',
  PTGH: 'GH',
};

/**
 * Strict monthly week periods.
 * Week 1 always starts from the 1st of the month (whatever day of week).
 * Week 1 ends on the first Saturday on or after the 1st.
 * Subsequent weeks: Monday to Saturday.
 * If Saturday exceeds month end, cap at last day of month.
 */
function getWeekPeriods(year: number, month: number) {
  const periods: { start: string; end: string; weekNum: number }[] = [];
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const lastDate = new Date(year, month, 0).getDate(); // last day of month
  const monthIdx = month - 1;

  let current = new Date(year, monthIdx, 1); // day 1
  let weekNum = 1;

  while (current.getDate() <= lastDate && current.getMonth() === monthIdx) {
    const weekStart = new Date(current);

    // Find end of week: Saturday, or month end if earlier
    let weekEnd = new Date(current);
    while (weekEnd.getDay() !== 6 && weekEnd.getDate() < lastDate) {
      weekEnd.setDate(weekEnd.getDate() + 1);
    }
    // Cap at month end
    if (weekEnd.getMonth() !== monthIdx) {
      weekEnd = new Date(year, monthIdx, lastDate);
    }

    periods.push({ start: fmt(weekStart), end: fmt(weekEnd), weekNum });
    weekNum++;

    // If week ended on Saturday, next week starts on Monday (skip Sunday)
    // If week ended before Saturday (month end), we're done
    if (weekEnd.getDay() === 6) {
      current = new Date(weekEnd);
      current.setDate(weekEnd.getDate() + 2); // Sat + 2 = Mon
    } else {
      break;
    }
  }

  return periods;
}

function getRecentMonths(count = 6): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

interface ActionRow {
  rank: number;
  category: string;
  sub_defects: string[];
  defect_qty: number;
  style_codes: string[];
  root_cause: string;
  impact: string;
  process: string;
  corrective_action: string;
  preventive_action: string;
  responsible: string;
  due_date: string;
  status: string;
  photo_before: string;
  photo_after: string;
}

function emptyAction(rank: number, category = '', defectQty = 0): ActionRow {
  return {
    rank, category, sub_defects: [], defect_qty: defectQty,
    style_codes: [], root_cause: '', impact: '', process: '',
    corrective_action: '', preventive_action: '',
    responsible: '', due_date: '', status: 'pending',
    photo_before: '', photo_after: '',
  };
}

export default function FQCRCAPage() {
  const { t, lang } = useI18n();
  const { isFullAccess } = useAuth();
  const { effectiveType, isLocked } = useBusinessTypeLock();
  const monthNames = lang === 'zh' ? MONTH_NAMES_ID.map((m, i) => `${i + 1}月`) : MONTH_NAMES_EN;

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [actionEdits, setActionEdits] = useState<Record<string, ActionRow[]>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const months = useMemo(() => getRecentMonths(6), []);
  const [year, month] = selectedMonth.split('-').map(Number);
  const weekPeriods = useMemo(() => getWeekPeriods(year, month), [year, month]);

  // Build lookup: "monday__businessType" -> rca record
  const rcaMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const r of records) {
      const key = `${r.week_start}__${r.business_type || ''}`;
      map[key] = r;
    }
    return map;
  }, [records]);

  const activeBt = effectiveType || 'ALL';

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month: selectedMonth });
      if (activeBt !== 'ALL') params.set('business_type', activeBt);
      const res = await fetch(`/api/fqc/rca?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
        const ids = new Set((data.records || []).map((r: any) => r.id));
        setExpandedWeeks(ids);
      }
    } catch { /* */ } finally {
      setLoading(false);
    }
  }, [selectedMonth, activeBt]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const toggleWeek = (id: string) => {
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAutoGenerate = async () => {
    setGenerating(true);
    setMsg(null);
    try {
      const [y, m] = selectedMonth.split('-');
      const firstDay = `${selectedMonth}-01`;
      const lastDay = new Date(parseInt(y), parseInt(m), 0).toISOString().split('T')[0];
      const res = await fetch('/api/fqc/rca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auto-generate', date_from: firstDay, date_to: lastDay, business_type: activeBt !== 'ALL' ? activeBt : undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setMsg({ type: 'success', text: `${data.message} (${data.created} ${t('rca.created')})` });
        fetchRecords();
      } else {
        const data = await res.json();
        setMsg({ type: 'error', text: data.error || t('common.error') });
      }
    } catch {
      setMsg({ type: 'error', text: t('common.error') });
    } finally {
      setGenerating(false);
    }
  };

  const getActionEdits = (rca: any): ActionRow[] => {
    if (actionEdits[rca.id]) return actionEdits[rca.id];
    const categories = rca.top_categories || [];
    if (categories.length === 0 && (!rca.rca_actions || rca.rca_actions.length === 0)) return [];
    if (rca.rca_actions && rca.rca_actions.length > 0) {
      const existing = rca.rca_actions.map((a: any) => ({
        rank: a.rank, category: a.category || '', sub_defects: a.sub_defects || [],
        defect_qty: a.defect_qty || 0, style_codes: a.style_codes || [],
        root_cause: a.root_cause || '', impact: a.impact || '', process: a.process || '',
        corrective_action: a.corrective_action || '', preventive_action: a.preventive_action || '',
        responsible: a.responsible || '', due_date: a.due_date || '',
        status: a.status || 'pending', photo_before: a.photo_before || '', photo_after: a.photo_after || '',
      }));
      setActionEdits(prev => ({ ...prev, [rca.id]: existing }));
      return existing;
    }
    const initial = categories.slice(0, 3).map((cat: any, i: number) =>
      emptyAction(i + 1, cat.category || cat.categoryKey?.replace('defect_', ''), cat.defectCount || cat.count || 0)
    );
    setActionEdits(prev => ({ ...prev, [rca.id]: initial }));
    return initial;
  };

  const updateActionField = (rcaId: string, rank: number, field: keyof ActionRow, value: string | number | string[]) => {
    setActionEdits(prev => {
      const actions = [...(prev[rcaId] || [])];
      const idx = actions.findIndex(a => a.rank === rank);
      if (idx >= 0) actions[idx] = { ...actions[idx], [field]: value };
      return { ...prev, [rcaId]: actions };
    });
  };

  const handleSave = async (rca: any) => {
    const actions = actionEdits[rca.id] || getActionEdits(rca);
    if (actions.length === 0) return;
    setSavingId(rca.id);
    try {
      const res = await fetch(`/api/fqc/rca/${rca.id}/actions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions }),
      });
      if (res.ok) {
        setMsg({ type: 'success', text: t('common.success') });
        fetchRecords();
      } else {
        setMsg({ type: 'error', text: t('common.error') });
      }
    } catch {
      setMsg({ type: 'error', text: t('common.error') });
    } finally {
      setSavingId(null);
    }
  };

  const handlePhotoUpload = async (rcaId: string, rank: number, field: 'photo_before' | 'photo_after', file: File) => {
    // Convert to base64 data URL for storage
    return new Promise<void>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        updateActionField(rcaId, rank, field, dataUrl);
        resolve();
      };
      reader.readAsDataURL(file);
    });
  };

  const statusColor = (status: string) => {
    if (status === 'completed') return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (status === 'in_progress') return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-slate-500 bg-slate-50 border-slate-200';
  };
  const statusIcon = (status: string) => {
    if (status === 'completed') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    if (status === 'in_progress') return <Clock className="h-3.5 w-3.5 text-amber-500" />;
    return <XCircle className="h-3.5 w-3.5 text-slate-400" />;
  };

  const monthLabel = `${monthNames[month - 1]} ${year}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="w-full sm:w-48">
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('rca.month')}</label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {months.map(m => {
                    const [y, mo] = m.split('-').map(Number);
                    return <SelectItem key={m} value={m}>{monthNames[mo - 1]} {y}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1" />
            {isFullAccess && (
              <Button onClick={handleAutoGenerate} disabled={generating} size="sm" className="h-9 bg-slate-900 hover:bg-slate-800">
                {generating
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> {t('rca.generating')}</>
                  : <><Plus className="h-3.5 w-3.5 mr-1" /> {t('rca.autoGenerate')}</>}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={fetchRecords} className="h-9">
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> {t('action.refresh')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {msg && (
        <Alert variant={msg.type === 'error' ? 'destructive' : 'default'}>
          {msg.type === 'error' ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          <AlertDescription>{msg.text}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}</div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-800">{monthLabel}</h2>
            <Badge variant="outline" className="text-xs">{weekPeriods.length} {t('rca.weeks')}</Badge>
            <Badge variant="outline" className="text-xs">{records.length} {t('rca.hasRCA')}</Badge>
          </div>

          <div className="space-y-3">
            {weekPeriods.map((wp) => {
              // Find all RCAs for this week period
              const weekRcas = records.filter((r) => r.week_start === wp.start && r.week_end === wp.end);
              const anyExpanded = weekRcas.some((r) => expandedWeeks.has(r.id));

              return (
                <div key={`${wp.start}_${wp.end}`} className="space-y-2">
                  {/* Week header */}
                  <div className="flex items-center gap-2 px-1">
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold bg-blue-600 text-white">
                      {wp.weekNum}
                    </div>
                    <span className="text-sm font-semibold text-slate-700">{t('rca.weekLabel')} {wp.weekNum}</span>
                    <span className="text-xs text-slate-400">{wp.start} ~ {wp.end}</span>
                    {weekRcas.length > 0 && weekRcas.map((r) => (
                      <Badge key={r.id} variant="outline" className={`text-[10px] ${BT_COLORS[r.business_type || ''] || 'bg-slate-100 text-slate-600'}`}>
                        {BT_SHORT[r.business_type || ''] || r.business_type || 'ALL'}
                      </Badge>
                    ))}
                    {weekRcas.length === 0 && (
                      <span className="text-[10px] text-slate-400">{t('rca.noData')}</span>
                    )}
                  </div>

                  {/* RCA cards per business type */}
                  {weekRcas.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/30 px-4 py-6 text-center">
                      <p className="text-xs text-slate-400">{t('rca.noData')}</p>
                    </div>
                  ) : (
                    weekRcas.map((rca) => {
                      const isExpanded = expandedWeeks.has(rca.id);
                      const bt = rca.business_type || '';
                      const btColor = BT_COLORS[bt] || 'bg-slate-100 text-slate-600';

                      return (
                        <Collapsible
                          key={rca.id}
                          open={isExpanded}
                          onOpenChange={() => toggleWeek(rca.id)}
                        >
                          <div className="rounded-lg border border-slate-200 bg-white">
                            <CollapsibleTrigger asChild>
                              <button className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors cursor-pointer">
                                <Badge variant="outline" className={`text-[10px] font-semibold ${btColor}`}>
                                  {BT_SHORT[bt] || bt}
                                </Badge>
                                <div className="hidden sm:flex items-center gap-4 text-xs flex-1">
                                  <span className="text-slate-400">{t('rca.totalInspected')}: <b className="text-slate-700">{(rca.total_inspected || 0).toLocaleString()}</b></span>
                                  <span className="text-slate-400">NG: <b className="text-red-600">{(rca.total_ng || 0).toLocaleString()}</b></span>
                                  <span className="text-slate-400">{t('rca.overallPassRate')}: <b className={`${(rca.overall_pass_rate || 0) >= 95 ? 'text-emerald-600' : 'text-red-600'}`}>{rca.overall_pass_rate}%</b></span>
                                </div>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0 ${statusColor(rca.status)}`}>
                                  {statusIcon(rca.status)}
                                  {rca.status === 'completed' ? t('rca.statusCompleted') : rca.status === 'in_progress' ? t('rca.statusInProgress') : t('rca.statusPending')}
                                </span>
                                {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
                              </button>
                            </CollapsibleTrigger>

                            <CollapsibleContent>
                              <div className="border-t border-slate-100 px-4 py-4 space-y-4">
                                {/* Mobile stats */}
                                <div className="grid grid-cols-3 gap-2 sm:hidden">
                                  <div className="bg-slate-50 rounded-lg p-2 text-center">
                                    <p className="text-[10px] text-slate-400">{t('rca.totalInspected')}</p>
                                    <p className="text-sm font-bold text-slate-700">{(rca.total_inspected || 0).toLocaleString()}</p>
                                  </div>
                                  <div className="bg-slate-50 rounded-lg p-2 text-center">
                                    <p className="text-[10px] text-slate-400">{t('rca.totalNG')}</p>
                                    <p className="text-sm font-bold text-red-600">{(rca.total_ng || 0).toLocaleString()}</p>
                                  </div>
                                  <div className="bg-slate-50 rounded-lg p-2 text-center">
                                    <p className="text-[10px] text-slate-400">{t('rca.overallPassRate')}</p>
                                    <p className={`text-sm font-bold ${(rca.overall_pass_rate || 0) >= 95 ? 'text-emerald-600' : 'text-red-600'}`}>{rca.overall_pass_rate}%</p>
                                  </div>
                                </div>

                                {/* Top 3 Sub-Defects (global) */}
                                {(rca.top_sub_defects || []).length > 0 && (
                                  <div>
                                    <h4 className="text-xs font-semibold text-slate-600 mb-2">Top 3 Sub-Defects</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                      {(rca.top_sub_defects || []).slice(0, 3).map((s: any, si: number) => (
                                        <div key={si} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                                          <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-1.5">
                                              <span className="text-xs font-bold text-slate-700">#{si + 1}</span>
                                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">{s.category || ''}</span>
                                            </div>
                                            <span className="text-xs font-bold text-red-600">{s.defectCount || s.count}</span>
                                          </div>
                                          <span className="text-[11px] text-slate-600 leading-tight block">{s.subDefect || s.name}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Action Items */}
                                {isFullAccess && (
                                  <div>
                                    <h4 className="text-xs font-semibold text-slate-600 mb-2">{t('rca.actionItems')}</h4>
                                    <div className="overflow-x-auto rounded-lg border">
                                      <Table>
                                        <TableHeader className="bg-slate-50">
                                          <TableRow>
                                            <TableHead className="text-xs w-8">#</TableHead>
                                            <TableHead className="text-xs min-w-[100px]">{t('rca.rootCause')}</TableHead>
                                            <TableHead className="text-xs min-w-[80px]">{t('rca.impact')}</TableHead>
                                            <TableHead className="text-xs min-w-[80px]">{t('rca.process')}</TableHead>
                                            <TableHead className="text-xs min-w-[100px]">{t('rca.correctiveAction')}</TableHead>
                                            <TableHead className="text-xs min-w-[100px]">{t('rca.preventiveAction')}</TableHead>
                                            <TableHead className="text-xs min-w-[80px]">{t('rca.responsible')}</TableHead>
                                            <TableHead className="text-xs w-28">{t('rca.deadline')}</TableHead>
                                            <TableHead className="text-xs w-24">{t('rca.photoBefore')}</TableHead>
                                            <TableHead className="text-xs w-24">{t('rca.photoAfter')}</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {getActionEdits(rca).map((action) => (
                                            <TableRow key={action.rank}>
                                              <TableCell className="text-xs font-bold text-slate-500">
                                                <div className="flex flex-col items-center">
                                                  <span>{action.rank}</span>
                                                  <span className="text-[9px] text-slate-400 normal-case max-w-[60px] truncate">{action.category}</span>
                                                </div>
                                              </TableCell>
                                              <TableCell className="text-xs"><Textarea className="min-h-[36px] text-xs p-1.5" value={action.root_cause} onChange={(e) => updateActionField(rca.id, action.rank, 'root_cause', e.target.value)} /></TableCell>
                                              <TableCell className="text-xs"><Textarea className="min-h-[36px] text-xs p-1.5" value={action.impact} onChange={(e) => updateActionField(rca.id, action.rank, 'impact', e.target.value)} /></TableCell>
                                              <TableCell className="text-xs"><Input className="h-8 text-xs" value={action.process} onChange={(e) => updateActionField(rca.id, action.rank, 'process', e.target.value)} /></TableCell>
                                              <TableCell className="text-xs"><Textarea className="min-h-[36px] text-xs p-1.5" value={action.corrective_action} onChange={(e) => updateActionField(rca.id, action.rank, 'corrective_action', e.target.value)} /></TableCell>
                                              <TableCell className="text-xs"><Textarea className="min-h-[36px] text-xs p-1.5" value={action.preventive_action} onChange={(e) => updateActionField(rca.id, action.rank, 'preventive_action', e.target.value)} /></TableCell>
                                              <TableCell className="text-xs"><Input className="h-8 text-xs" value={action.responsible} onChange={(e) => updateActionField(rca.id, action.rank, 'responsible', e.target.value)} /></TableCell>
                                              <TableCell className="text-xs"><Input type="date" className="h-8 text-xs" value={action.due_date} onChange={(e) => updateActionField(rca.id, action.rank, 'due_date', e.target.value)} /></TableCell>
                                              <TableCell className="text-xs">
                                                <PhotoCell
                                                  value={action.photo_before}
                                                  onUpload={(file) => handlePhotoUpload(rca.id, action.rank, 'photo_before', file)}
                                                  onRemove={() => updateActionField(rca.id, action.rank, 'photo_before', '')}
                                                  inputRef={(el) => { fileInputRefs.current[`${rca.id}_${action.rank}_before`] = el; }}
                                                />
                                              </TableCell>
                                              <TableCell className="text-xs">
                                                <PhotoCell
                                                  value={action.photo_after}
                                                  onUpload={(file) => handlePhotoUpload(rca.id, action.rank, 'photo_after', file)}
                                                  onRemove={() => updateActionField(rca.id, action.rank, 'photo_after', '')}
                                                  inputRef={(el) => { fileInputRefs.current[`${rca.id}_${action.rank}_after`] = el; }}
                                                />
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                          {getActionEdits(rca).length === 0 && (
                                            <TableRow>
                                              <TableCell colSpan={10} className="text-center py-4 text-xs text-slate-400">{t('rca.noActionItems')}</TableCell>
                                            </TableRow>
                                          )}
                                        </TableBody>
                                      </Table>
                                    </div>
                                    <div className="mt-3 flex justify-end">
                                      <Button onClick={() => handleSave(rca)} disabled={savingId === rca.id} size="sm" className="bg-slate-900 hover:bg-slate-800">
                                        {savingId === rca.id
                                          ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> {t('action.save')}...</>
                                          : <><Save className="h-3.5 w-3.5 mr-1" /> {t('action.save')}</>}
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function PhotoCell({ value, onUpload, onRemove, inputRef }: {
  value: string;
  onUpload: (file: File) => void;
  onRemove: () => void;
  inputRef: (el: HTMLInputElement | null) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      {value ? (
        <div className="relative group w-16 h-12 rounded border overflow-hidden">
          <img src={value} alt="" className="w-full h-full object-cover" />
          <button
            onClick={onRemove}
            className="absolute top-0 right-0 bg-red-500 text-white rounded-bl p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef(null)?.click()}
          className="w-16 h-12 rounded border border-dashed border-slate-300 flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:border-slate-400 hover:text-slate-500 transition-colors"
        >
          <Camera className="h-3.5 w-3.5" />
          <span className="text-[8px]">Upload</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }}
      />
    </div>
  );
}
