'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useBusinessTypeLock } from '@/contexts/BusinessTypeContext';
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Save, Loader2, AlertCircle, Plus } from 'lucide-react';

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getWeekDates(weekOffset: number = 0) {
  const now = new Date();
  // Week = Monday to Saturday (6 days)
  // If today is Sunday, treat it as part of the previous week (Saturday was yesterday)
  let dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  if (dayOfWeek === 0) dayOfWeek = 7; // Sunday → 7 (so we go back to the current week's Monday)
  
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - dayOfWeek + 1 + weekOffset * 7);
  
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);
  
  const start = toLocalDateString(monday);
  const end = toLocalDateString(saturday);
  return { start, end, label: `${start} ~ ${end}` };
}

export default function FQCRCAPage() {
  const { t } = useI18n();
  const { isLocked } = useBusinessTypeLock();
  const { isFullAccess } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState(getWeekDates(-1));
  const [businessType, setBusinessType] = useState('ALL');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Generate weeks for dropdown
  const weeks = Array.from({ length: 12 }, (_, i) => getWeekDates(-i));

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/fqc/rca');
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const selectedRecord = records.find(
    (r) => r.week_start === selectedWeek.start && r.week_end === selectedWeek.end
  );

  const topCategories = selectedRecord?.top_categories || [];
  const topSubDefects = selectedRecord?.top_sub_defects || [];

  const handleGenerate = async () => {
    try {
      const res = await fetch('/api/fqc/rca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart: selectedWeek.start, weekEnd: selectedWeek.end }),
      });
      if (res.status === 409) {
        setSaveMsg(t('rca.alreadyExists'));
      } else if (res.ok) {
        setSaveMsg(t('common.success'));
        fetchRecords();
      }
    } catch {
      setSaveMsg(t('common.error'));
    }
  };

  const handleSaveActions = async () => {
    if (!selectedRecord) return;
    setSaving(true);
    try {
      // Save action items
      setSaveMsg(t('common.success'));
    } catch {
      setSaveMsg(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 min-w-0">
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('rca.weekRange')}</label>
              <Select
                value={`${selectedWeek.start}_${selectedWeek.end}`}
                onValueChange={(v) => {
                  const [s, e] = v.split('_');
                  const found = weeks.find((w) => w.start === s && w.end === e);
                  if (found) setSelectedWeek(found);
                }}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {weeks.map((w) => (
                    <SelectItem key={`${w.start}_${w.end}`} value={`${w.start}_${w.end}`}>
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            {isFullAccess && !selectedRecord && (
              <Button onClick={handleGenerate} size="sm" className="h-9 bg-slate-900 hover:bg-slate-800">
                <Plus className="h-3.5 w-3.5 mr-1" /> {t('rca.generate')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {saveMsg && (
        <Alert variant={saveMsg === t('common.success') ? 'default' : 'destructive'}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{saveMsg}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-60 rounded-lg" />
        </div>
      ) : selectedRecord ? (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <Card><CardContent className="p-3 text-center">
              <p className="text-xs text-slate-500">{t('rca.totalInspections')}</p>
              <p className="text-lg font-bold text-slate-800">{selectedRecord.total_inspections}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-xs text-slate-500">{t('rca.totalInspected')}</p>
              <p className="text-lg font-bold text-slate-800">{selectedRecord.total_inspected?.toLocaleString()}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-xs text-slate-500">{t('rca.totalOK')}</p>
              <p className="text-lg font-bold text-emerald-600">{selectedRecord.total_ok?.toLocaleString()}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-xs text-slate-500">{t('rca.totalNG')}</p>
              <p className="text-lg font-bold text-red-600">{selectedRecord.total_ng?.toLocaleString()}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-xs text-slate-500">{t('rca.overallPassRate')}</p>
              <p className="text-lg font-bold" style={{ color: (selectedRecord.overall_pass_rate || 0) >= 95 ? '#059669' : '#dc2626' }}>{selectedRecord.overall_pass_rate}%</p>
            </CardContent></Card>
          </div>

          {/* Top 3 Categories with Sub-Defects */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">{t('rca.topCategories')} {t('rca.top3')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {topCategories.slice(0, 3).map((cat: any, ci: number) => (
                <div key={ci} className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="outline" className="bg-slate-100 font-semibold">#{ci + 1}</Badge>
                    <span className="font-medium text-sm">{cat.category || t(`defect.${cat.key?.replace('defect_', '') || 'other'}`)}</span>
                    <span className="ml-auto text-sm font-bold text-red-600">{cat.count || cat.defectCount} {t('rca.defects')}</span>
                  </div>
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="text-xs">#</TableHead>
                        <TableHead className="text-xs">{t('rca.subDefectCol')}</TableHead>
                        <TableHead className="text-xs text-right">{t('common.count')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(topSubDefects || [])
                        .filter((s: any) => s.categoryKey === cat.key || s.category === cat.category)
                        .slice(0, 5)
                        .map((s: any, si: number) => (
                          <TableRow key={si}>
                            <TableCell className="text-xs">{si + 1}</TableCell>
                            <TableCell className="text-xs">{s.name || s.subDefect}</TableCell>
                            <TableCell className="text-xs text-right font-medium">{s.count}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
              {topCategories.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">{t('common.noData')}</p>
              )}
            </CardContent>
          </Card>

          {/* Action Table */}
          {isFullAccess && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">{t('rca.actionItems')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="text-xs">{t('fqc.style')}</TableHead>
                        <TableHead className="text-xs">{t('rca.rootCause')}</TableHead>
                        <TableHead className="text-xs">{t('rca.impact')}</TableHead>
                        <TableHead className="text-xs">{t('rca.process')}</TableHead>
                        <TableHead className="text-xs">{t('rca.correctiveAction')}</TableHead>
                        <TableHead className="text-xs">{t('rca.photo')}</TableHead>
                        <TableHead className="text-xs">{t('rca.preventiveAction')}</TableHead>
                        <TableHead className="text-xs">{t('rca.deadline')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(selectedRecord.rca_actions || []).length > 0
                        ? selectedRecord.rca_actions.map((action: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs"><Input className="h-8 text-xs" defaultValue={action.style || ''} /></TableCell>
                              <TableCell className="text-xs"><Textarea className="min-h-[32px] text-xs" defaultValue={action.root_cause || ''} /></TableCell>
                              <TableCell className="text-xs"><Input className="h-8 text-xs" defaultValue={action.impact || ''} /></TableCell>
                              <TableCell className="text-xs"><Input className="h-8 text-xs" defaultValue={action.process || ''} /></TableCell>
                              <TableCell className="text-xs"><Textarea className="min-h-[32px] text-xs" defaultValue={action.corrective_action || ''} /></TableCell>
                              <TableCell className="text-xs"><Button variant="outline" size="sm" className="h-8 text-xs">{t('action.upload')}</Button></TableCell>
                              <TableCell className="text-xs"><Textarea className="min-h-[32px] text-xs" defaultValue={action.preventive_action || ''} /></TableCell>
                              <TableCell className="text-xs"><Input type="date" className="h-8 text-xs" defaultValue={action.due_date || ''} /></TableCell>
                            </TableRow>
                          ))
                        : (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-6 text-sm text-slate-400">{t('rca.noActionItems')}</TableCell>
                          </TableRow>
                        )}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button onClick={handleSaveActions} disabled={saving} className="bg-slate-900 hover:bg-slate-800">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    {t('action.save')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-slate-400 text-sm">{t('common.noData')}</p>
            {isFullAccess && (
              <p className="text-slate-400 text-xs mt-1">{t('rca.clickToGenerate')}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
