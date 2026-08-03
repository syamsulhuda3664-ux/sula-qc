'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Database,
  Trash2,
  RefreshCw,
  AlertTriangle,
  Shield,
  HardDrive,
  CheckCircle2,
  XCircle,
  CalendarDays,
} from 'lucide-react';

interface TableStat {
  key: string;
  label: string;
  labelZh: string;
  icon: string;
  protect: boolean;
  count: number;
  error: string | null;
}

export default function DBManagementPage() {
  const { t, lang } = useI18n();
  const [tables, setTables] = useState<TableStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [dateTable, setDateTable] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/db-management');
      if (res.ok) {
        const data = await res.json();
        setTables(data.tables || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleResetAll = async () => {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/db-management', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetAll: true }),
      });
      const data = await res.json();
      if (res.ok) {
        const failed = Object.entries(data.results || {}).filter(([, v]) => !(v as any).deleted);
        if (failed.length === 0) {
          setMessage({ type: 'success', text: lang === 'zh' ? '所有数据已重置' : 'All data has been reset' });
        } else {
          setMessage({ type: 'error', text: `Partial: ${failed.length} table(s) failed` });
        }
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setActionLoading(false);
      setResetDialogOpen(false);
      fetchStats();
    }
  };

  const handleDeleteSelected = async () => {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/db-management', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables: selectedTables }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: lang === 'zh' ? '删除完成' : 'Delete completed' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setActionLoading(false);
      setDeleteDialogOpen(false);
      setSelectedTables([]);
      fetchStats();
    }
  };

  const handleDeleteByDate = async () => {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/db-management', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: dateTable, dateFrom, dateTo }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setActionLoading(false);
      setDateDialogOpen(false);
      setDateTable('');
      setDateFrom('');
      setDateTo('');
      fetchStats();
    }
  };

  const toggleTable = (key: string) => {
    setSelectedTables(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const totalRecords = tables.reduce((sum, t) => sum + (t.count > 0 ? t.count : 0), 0);
  const dataTables = tables.filter(t => !t.protect);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-lg font-semibold">{lang === 'zh' ? '数据库管理' : 'Database Management'}</h2>
          <p className="text-sm text-slate-500">{lang === 'zh' ? '管理QC系统数据表' : 'Manage QC system data tables'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            {t('action.refresh')}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setResetDialogOpen(true)}
            disabled={totalRecords === 0}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            {lang === 'zh' ? '重置全部数据' : 'Reset All Data'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-xs text-slate-500">{lang === 'zh' ? '数据表' : 'Tables'}</p>
                <p className="text-lg font-bold">{tables.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-emerald-500" />
              <div>
                <p className="text-xs text-slate-500">{lang === 'zh' ? '总记录数' : 'Total Records'}</p>
                <p className="text-lg font-bold">{totalRecords.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-500" />
              <div>
                <p className="text-xs text-slate-500">{lang === 'zh' ? '受保护表' : 'Protected'}</p>
                <p className="text-lg font-bold">{tables.filter(t => t.protect).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-purple-500" />
              <div>
                <p className="text-xs text-slate-500">{lang === 'zh' ? '可管理表' : 'Manageable'}</p>
                <p className="text-lg font-bold">{dataTables.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Message */}
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}
          className={message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : ''}
        >
          {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* Table List */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="text-xs w-10">#</TableHead>
                  <TableHead className="text-xs">{lang === 'zh' ? '数据表' : 'Table'}</TableHead>
                  <TableHead className="text-xs text-center">{lang === 'zh' ? '记录数' : 'Records'}</TableHead>
                  <TableHead className="text-xs text-center">{lang === 'zh' ? '状态' : 'Status'}</TableHead>
                  <TableHead className="text-xs text-center">{lang === 'zh' ? '操作' : 'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 9 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : tables.map((tbl, idx) => (
                  <TableRow key={tbl.key} className="hover:bg-slate-50">
                    <TableCell className="text-xs text-slate-400 font-mono">{idx + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                          tbl.protect ? 'bg-amber-100' : 'bg-slate-100'
                        }`}>
                          {tbl.protect
                            ? <Shield className="h-4 w-4 text-amber-600" />
                            : <Database className="h-4 w-4 text-slate-500" />
                          }
                        </div>
                        <div>
                          <p className="text-sm font-medium font-mono">{tbl.key}</p>
                          <p className="text-xs text-slate-500">
                            {lang === 'zh' ? tbl.labelZh : tbl.label}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`text-sm font-bold ${
                        tbl.count > 0 ? 'text-slate-800' : 'text-slate-400'
                      }`}>
                        {tbl.count === -1 ? '—' : tbl.count.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {tbl.error ? (
                        <Badge variant="destructive" className="text-xs">Error</Badge>
                      ) : tbl.protect ? (
                        <Badge className="text-xs bg-amber-100 text-amber-700 hover:bg-amber-100">
                          <Shield className="h-3 w-3 mr-1" />
                          {lang === 'zh' ? '受保护' : 'Protected'}
                        </Badge>
                      ) : tbl.count > 0 ? (
                        <Badge className="text-xs bg-blue-100 text-blue-700 hover:bg-blue-100">
                          <Database className="h-3 w-3 mr-1" />
                          {lang === 'zh' ? '有数据' : 'Has Data'}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          {lang === 'zh' ? '空' : 'Empty'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-1">
                        {!tbl.protect && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => { setSelectedTables([tbl.key]); setDeleteDialogOpen(true); }}
                              disabled={tbl.count === 0}
                              title={lang === 'zh' ? '清空此表' : 'Clear this table'}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-orange-500 hover:text-orange-700 hover:bg-orange-50"
                              onClick={() => { setDateTable(tbl.key); setDateDialogOpen(true); }}
                              disabled={tbl.count === 0}
                              title={lang === 'zh' ? '按日期删除' : 'Delete by date'}
                            >
                              <CalendarDays className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Reset All Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              {lang === 'zh' ? '重置全部数据' : 'Reset All Data'}
            </DialogTitle>
            <DialogDescription>
              {lang === 'zh'
                ? '此操作将删除所有非受保护数据表中的全部记录。用户表将保留。此操作不可撤销！'
                : 'This will delete ALL records from all non-protected tables. The Users table will be preserved. This action cannot be undone!'}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
            <p className="font-medium text-red-800 mb-1">{lang === 'zh' ? '将清空以下表：' : 'Tables to be cleared:'}</p>
            <div className="flex flex-wrap gap-1">
              {dataTables.map(t => (
                <Badge key={t.key} variant="outline" className="text-xs font-mono">{t.key}</Badge>
              ))}
            </div>
            <p className="mt-2 text-red-700 font-semibold">{lang === 'zh'
              ? `共 ${totalRecords.toLocaleString()} 条记录将被删除`
              : `${totalRecords.toLocaleString()} records will be deleted`}</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleResetAll} disabled={actionLoading}>
              {actionLoading && <RefreshCw className="h-4 w-4 mr-1 animate-spin" />}
              {lang === 'zh' ? '确认重置' : 'Confirm Reset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Selected Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              {lang === 'zh' ? '清空数据表' : 'Clear Tables'}
            </DialogTitle>
            <DialogDescription>
              {lang === 'zh'
                ? '确定要清空选中的数据表吗？此操作不可撤销。'
                : 'Are you sure you want to clear the selected tables? This cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1">
            {selectedTables.map(t => (
              <Badge key={t} variant="outline" className="text-xs font-mono">{t}</Badge>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setSelectedTables([]); }}>
              {t('action.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDeleteSelected} disabled={actionLoading}>
              {actionLoading && <RefreshCw className="h-4 w-4 mr-1 animate-spin" />}
              {t('action.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete by Date Dialog */}
      <Dialog open={dateDialogOpen} onOpenChange={setDateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <CalendarDays className="h-5 w-5" />
              {lang === 'zh' ? '按日期范围删除' : 'Delete by Date Range'}
            </DialogTitle>
            <DialogDescription>
              <span className="font-mono text-sm">{dateTable}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('common.from')}</label>
              <input
                type="date"
                className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('common.to')}</label>
              <input
                type="date"
                className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
              />
            </div>
            {(!dateFrom || !dateTo) && (
              <p className="text-xs text-slate-500">{lang === 'zh' ? '两个日期都必须填写' : 'Both dates are required'}</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setDateDialogOpen(false); setDateTable(''); setDateFrom(''); setDateTo(''); }}>
              {t('action.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteByDate}
              disabled={actionLoading || !dateFrom || !dateTo}
            >
              {actionLoading && <RefreshCw className="h-4 w-4 mr-1 animate-spin" />}
              {t('action.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
