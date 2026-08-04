'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  RefreshCw, CheckCircle2, XCircle, Clock,
} from 'lucide-react';

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Get Monday-Saturday week periods for a given month.
 * A week belongs to the month if its Monday falls in that month.
 */
function getWeekPeriods(year: number, month: number) {
  const periods: { monday: string; saturday: string; weekNum: number }[] = [];
  const firstDay = new Date(year, month - 1, 1);
  let dayOfWeek = firstDay.getDay();
  if (dayOfWeek === 0) dayOfWeek = 7;
  const diff = 1 - dayOfWeek;
  const firstMonday = new Date(firstDay);
  firstMonday.setDate(firstDay.getDate() + diff);

  // If firstMonday is in previous month, move to next Monday
  if (firstMonday.getMonth() !== month - 1) {
    firstMonday.setDate(firstMonday.getDate() + 7);
  }

  let weekNum = 1;
  let current = new Date(firstMonday);
  while (current.getMonth() === month - 1) {
    const saturday = new Date(current);
    saturday.setDate(current.getDate() + 5);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    periods.push({
      monday: fmt(current),
      saturday: fmt(saturday),
      weekNum,
    });
    weekNum++;
    current.setDate(current.getDate() + 7);
  }
  return periods;
}

/** Get a list of YYYY-MM strings for the last 6 months */
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
}

function emptyAction(rank: number, category = '', defectQty = 0): ActionRow {
  return {
    rank, category, sub_defects: [], defect_qty: defectQty,
    style_codes: [], root_cause: '', impact: '', process: '',
    corrective_action: '', preventive_action: '',
    responsible: '', due_date: '', status: 'pending',
  };
}

export default function FQCRCAPage() {
  const { t, lang } = useI18n();
  const { isFullAccess } = useAuth();
  const monthNames = lang === 'zh'
    ? MONTH_NAMES_ID.map((m, i) => `${i + 1}月`)
    : MONTH_NAMES_EN;

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

  const months = useMemo(() => getRecentMonths(6), []);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/fqc/rca?month=${selectedMonth}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
        // Auto-expand all weeks
        const ids = new Set((data.records || []).map((r: any) => r.id));
        setExpandedWeeks(ids);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Group records by month-year
  const [year, month] = selectedMonth.split('-').map(Number);
  const weekPeriods = useMemo(() => getWeekPeriods(year, month), [year, month]);

  // Map records to week periods
  const weekMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const r of records) {
      map[r.week_start] = r;
    }
    return map;
  }, [records]);

  const toggleWeek = (id: string) => {
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
        body: JSON.stringify({ action: 'auto-generate', date_from: firstDay, date_to: lastDay }),
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

  // Get or initialize action edits for an RCA record
  const getActionEdits = (rca: any): ActionRow[] => {
    if (actionEdits[rca.id]) return actionEdits[rca.id];
    const categories = rca.top_categories || [];
    if (categories.length === 0) return [];
    const subDefects = rca.top_sub_defects || [];
    // Initialize from existing rca_actions or from categories
    if (rca.rca_actions && rca.rca_actions.length > 0) {
      const existing = rca.rca_actions.map((a: any) => ({
        rank: a.rank,
        category: a.category || '',
        sub_defects: a.sub_defects || [],
        defect_qty: a.defect_qty || 0,
        style_codes: a.style_codes || [],
        root_cause: a.root_cause || '',
        impact: a.impact || '',
        process: a.process || '',
        corrective_action: a.corrective_action || '',
        preventive_action: a.preventive_action || '',
        responsible: a.responsible || '',
        due_date: a.due_date || '',
        status: a.status || 'pending',
      }));
      setActionEdits(prev => ({ ...prev, [rca.id]: existing }));
      return existing;
    }
    // Initialize from top categories
    const initial = categories.slice(0, 3).map((cat: any, i: number) => {
      const catSubs = subDefects
        .filter((s: any) => s.categoryKey === cat.categoryKey || s.category === cat.category)
        .map((s: any) => s.subDefect || s.name)
        .slice(0, 5);
      return emptyAction(i + 1, cat.category || cat.categoryKey?.replace('defect_', ''), cat.defectCount || cat.count || 0);
    });
    setActionEdits(prev => ({ ...prev, [rca.id]: initial }));
    return initial;
  };

  const updateActionField = (rcaId: string, rank: number, field: keyof ActionRow, value: string | number | string[]) => {
    setActionEdits(prev => {
      const actions = [...(prev[rcaId] || [])];
      const idx = actions.findIndex(a => a.rank === rank);
      if (idx >= 0) {
        actions[idx] = { ...actions[idx], [field]: value };
      }
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
      {/* Header Filter */}
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
                    return (
                      <SelectItem key={m} value={m}>
                        {monthNames[mo - 1]} {y}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1" />
            {isFullAccess && (
              <Button
                onClick={handleAutoGenerate}
                disabled={generating}
                size="sm"
                className="h-9 bg-slate-900 hover:bg-slate-800"
              >
                {generating
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> {t('rca.generating')}</>
                  : <><Plus className="h-3.5 w-3.5 mr-1" /> {t('rca.autoGenerate')}</>
                }
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
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          {/* Month header */}
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-800">{monthLabel}</h2>
            <Badge variant="outline" className="text-xs">
              {weekPeriods.length} {t('rca.weeks')}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {records.length} {t('rca.hasRCA')}
            </Badge>
          </div>

          {/* Week Sections */}
          <div className="space-y-3">
            {weekPeriods.map((wp) => {
              const rca = weekMap[wp.monday];
              const isExpanded = expandedWeeks.has(rca?.id || `none-${wp.monday}`);
              const hasData = !!rca;
              const status = rca?.status || 'none';

              return (
                <Collapsible
                  key={wp.monday}
                  open={isExpanded}
                  onOpenChange={() => rca && toggleWeek(rca.id)}
                >
                  <div className={`rounded-lg border ${hasData ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50/50'}`}>
                    {/* Week Header */}
                    <CollapsibleTrigger asChild>
                      <button className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${hasData ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default opacity-60'}`}>
                        <div className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold ${hasData ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                          {wp.weekNum}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-800">
                              {t('rca.weekLabel')} {wp.weekNum}
                            </span>
                            {hasData && (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusColor(status)}`}>
                                {statusIcon(status)}
                                {status === 'completed' ? t('rca.statusCompleted') : status === 'in_progress' ? t('rca.statusInProgress') : t('rca.statusPending')}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{wp.monday} ~ {wp.saturday}</p>
                        </div>
                        {hasData && rca && (
                          <div className="hidden sm:flex items-center gap-4 text-xs">
                            <div className="text-center">
                              <p className="text-slate-400">{t('rca.totalInspected')}</p>
                              <p className="font-bold text-slate-700">{(rca.total_inspected || 0).toLocaleString()}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-slate-400">{t('rca.totalNG')}</p>
                              <p className="font-bold text-red-600">{(rca.total_ng || 0).toLocaleString()}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-slate-400">{t('rca.overallPassRate')}</p>
                              <p className={`font-bold ${(rca.overall_pass_rate || 0) >= 95 ? 'text-emerald-600' : 'text-red-600'}`}>{rca.overall_pass_rate}%</p>
                            </div>
                          </div>
                        )}
                        {hasData && (
                          isExpanded
                            ? <ChevronDown className="h-4 w-4 text-slate-400" />
                            : <ChevronRight className="h-4 w-4 text-slate-400" />
                        )}
                        {!hasData && (
                          <span className="text-xs text-slate-400">{t('rca.noData')}</span>
                        )}
                      </button>
                    </CollapsibleTrigger>

                    {/* Week Content */}
                    {hasData && rca && (
                      <CollapsibleContent>
                        <div className="border-t border-slate-100 px-4 py-4 space-y-4">
                          {/* Summary row for mobile */}
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

                          {/* Top 3 Categories */}
                          {(rca.top_categories || []).length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-slate-600 mb-2">{t('rca.topCategories')} {t('rca.top3')}</h4>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                {(rca.top_categories || []).slice(0, 3).map((cat: any, ci: number) => (
                                  <div key={ci} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-xs font-semibold text-slate-700">
                                        #{ci + 1} {cat.category || cat.categoryKey?.replace('defect_', '')}
                                      </span>
                                      <span className="text-xs font-bold text-red-600">{cat.defectCount || cat.count}</span>
                                    </div>
                                    {/* Sub-defects for this category */}
                                    <div className="space-y-0.5">
                                      {(rca.top_sub_defects || [])
                                        .filter((s: any) => s.categoryKey === cat.categoryKey || s.category === cat.category)
                                        .slice(0, 3)
                                        .map((s: any, si: number) => (
                                          <div key={si} className="flex justify-between text-[10px]">
                                            <span className="text-slate-500 truncate mr-2">{s.subDefect || s.name}</span>
                                            <span className="text-slate-600 font-medium">{s.defectCount || s.count}</span>
                                          </div>
                                        ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Action Items (full access only) */}
                          {isFullAccess && (
                            <div>
                              <h4 className="text-xs font-semibold text-slate-600 mb-2">{t('rca.actionItems')}</h4>
                              <div className="overflow-x-auto rounded-lg border">
                                <Table>
                                  <TableHeader className="bg-slate-50">
                                    <TableRow>
                                      <TableHead className="text-xs w-8">#</TableHead>
                                      <TableHead className="text-xs">{t('rca.rootCause')}</TableHead>
                                      <TableHead className="text-xs">{t('rca.impact')}</TableHead>
                                      <TableHead className="text-xs">{t('rca.process')}</TableHead>
                                      <TableHead className="text-xs">{t('rca.correctiveAction')}</TableHead>
                                      <TableHead className="text-xs">{t('rca.preventiveAction')}</TableHead>
                                      <TableHead className="text-xs">{t('rca.responsible')}</TableHead>
                                      <TableHead className="text-xs w-28">{t('rca.deadline')}</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {getActionEdits(rca).map((action) => (
                                      <TableRow key={action.rank}>
                                        <TableCell className="text-xs font-bold text-slate-500">
                                          <div className="flex flex-col items-center">
                                            <span>{action.rank}</span>
                                            <span className="text-[9px] text-slate-400 normal-case">{action.category}</span>
                                            <span className="text-[9px] text-red-500">{action.defect_qty} {t('rca.defects')}</span>
                                          </div>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                          <Textarea
                                            className="min-h-[36px] text-xs p-1.5"
                                            value={action.root_cause}
                                            onChange={(e) => updateActionField(rca.id, action.rank, 'root_cause', e.target.value)}
                                            placeholder={t('rca.rootCause')}
                                          />
                                        </TableCell>
                                        <TableCell className="text-xs">
                                          <Textarea
                                            className="min-h-[36px] text-xs p-1.5"
                                            value={action.impact}
                                            onChange={(e) => updateActionField(rca.id, action.rank, 'impact', e.target.value)}
                                            placeholder={t('rca.impact')}
                                          />
                                        </TableCell>
                                        <TableCell className="text-xs">
                                          <Input
                                            className="h-8 text-xs"
                                            value={action.process}
                                            onChange={(e) => updateActionField(rca.id, action.rank, 'process', e.target.value)}
                                            placeholder={t('rca.process')}
                                          />
                                        </TableCell>
                                        <TableCell className="text-xs">
                                          <Textarea
                                            className="min-h-[36px] text-xs p-1.5"
                                            value={action.corrective_action}
                                            onChange={(e) => updateActionField(rca.id, action.rank, 'corrective_action', e.target.value)}
                                            placeholder={t('rca.correctiveAction')}
                                          />
                                        </TableCell>
                                        <TableCell className="text-xs">
                                          <Textarea
                                            className="min-h-[36px] text-xs p-1.5"
                                            value={action.preventive_action}
                                            onChange={(e) => updateActionField(rca.id, action.rank, 'preventive_action', e.target.value)}
                                            placeholder={t('rca.preventiveAction')}
                                          />
                                        </TableCell>
                                        <TableCell className="text-xs">
                                          <Input
                                            className="h-8 text-xs"
                                            value={action.responsible}
                                            onChange={(e) => updateActionField(rca.id, action.rank, 'responsible', e.target.value)}
                                            placeholder={t('rca.responsible')}
                                          />
                                        </TableCell>
                                        <TableCell className="text-xs">
                                          <Input
                                            type="date"
                                            className="h-8 text-xs"
                                            value={action.due_date}
                                            onChange={(e) => updateActionField(rca.id, action.rank, 'due_date', e.target.value)}
                                          />
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                    {getActionEdits(rca).length === 0 && (
                                      <TableRow>
                                        <TableCell colSpan={8} className="text-center py-4 text-xs text-slate-400">
                                          {t('rca.noActionItems')}
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </TableBody>
                                </Table>
                              </div>
                              <div className="mt-3 flex justify-end">
                                <Button
                                  onClick={() => handleSave(rca)}
                                  disabled={savingId === rca.id}
                                  size="sm"
                                  className="bg-slate-900 hover:bg-slate-800"
                                >
                                  {savingId === rca.id
                                    ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> {t('action.save')}...</>
                                    : <><Save className="h-3.5 w-3.5 mr-1" /> {t('action.save')}</>
                                  }
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    )}
                  </div>
                </Collapsible>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
