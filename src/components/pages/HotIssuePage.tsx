'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useAuth } from '@/contexts/AuthContext';
import { useBusinessTypeLock, BUSINESS_TYPES, type BusinessType } from '@/contexts/BusinessTypeContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Flame, Plus, Loader2, AlertCircle, CheckCircle2, Trash2, Pencil, X, Camera, Image as ImageIcon, RefreshCw, XCircle, Clock, Eye,
} from 'lucide-react';
import { SUBDEFECT_NAMES, SUBDEFECT_NAMES_ZH, CATEGORY_ZH, getSubDefectCategory, DEFECT_CATEGORIES } from '@/lib/rca-generator';

// Build sub-defect options with category grouping
const SUBDEFECT_OPTIONS: { value: string; label: string; category: string; categoryZh: string }[] = [];
SUBDEFECT_NAMES.forEach((name, i) => {
  const cat = getSubDefectCategory(i);
  SUBDEFECT_OPTIONS.push({
    value: name,
    label: name,
    category: cat.category,
    categoryZh: CATEGORY_ZH[cat.category] || cat.category,
  });
});

const MONTH_NAMES_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const MONTH_NAMES_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const BT_COLORS: Record<string, string> = {
  PTOEM: 'bg-blue-100 text-blue-700 border-blue-200',
  PTB2C: 'bg-violet-100 text-violet-700 border-violet-200',
  PTGH: 'bg-amber-100 text-amber-700 border-amber-200',
};

interface HotIssueRecord {
  id: string;
  issue_date: string;
  business_type: string;
  category: string | null;
  sub_defect: string;
  defect_qty: number;
  style_codes: string[] | null;
  root_cause: string | null;
  impact: string | null;
  process: string | null;
  corrective_action: string | null;
  preventive_action: string | null;
  responsible: string | null;
  due_date: string | null;
  status: string;
  photo_before: string | null;
  photo_after: string | null;
  created_by: string | null;
  created_at: string;
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

function compressImageClient(file: File, maxDim = 800, quality = 0.6): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Compression failed')); return; }
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
      }, 'image/jpeg', quality);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

function PhotoThumbnail({ value, onUpload, onRemove, disabled }: {
  value: string; onUpload: (file: File) => void; onRemove: () => void; disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = '';
    try { setUploading(true); const c = await compressImageClient(f); onUpload(c); } catch {} finally { setUploading(false); }
  };

  if (value) {
    return (
      <div className="relative group w-[72px] h-[54px] rounded border border-slate-200 overflow-hidden bg-slate-50">
        <img src={value} alt="" className="w-full h-full object-cover" />
        {!disabled && (
          <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="absolute top-0 right-0 bg-red-500 text-white rounded-bl p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }
  if (disabled) {
    return <div className="w-[72px] h-[54px] rounded border border-dashed border-slate-200 flex items-center justify-center text-slate-300"><ImageIcon className="h-3.5 w-3.5" /></div>;
  }
  return (
    <div className="flex flex-col items-center">
      <button onClick={() => ref.current?.click()} disabled={uploading} className="w-[72px] h-[54px] rounded border border-dashed border-slate-300 flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/30 transition-colors disabled:opacity-50">
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
        <span className="text-[7px]">{uploading ? '...' : 'Upload'}</span>
      </button>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

const EMPTY_FORM = {
  issue_date: '', business_type: '', category: '', sub_defect: '', defect_qty: 0, style_codes: '',
  root_cause: '', impact: '', process: '', corrective_action: '', preventive_action: '',
  responsible: '', due_date: '', photo_before: '', photo_after: '',
};

export default function HotIssuePage() {
  const { t, lang } = useI18n();
  const isZhMode = lang === 'zh';
  const { user } = useAuth();
  const { effectiveType } = useBusinessTypeLock();
  const canEdit = user?.role === 'staff_qa' || user?.role === 'manager_qc';

  const monthNames = isZhMode ? MONTH_NAMES_ID.map((m, i) => `${i + 1}月`) : MONTH_NAMES_EN;
  const months = useMemo(() => getRecentMonths(6), []);
  const activeBt = effectiveType || 'ALL';

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [records, setRecords] = useState<HotIssueRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch records
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month: selectedMonth });
      if (activeBt !== 'ALL') params.set('business_type', activeBt);
      const res = await fetch(`/api/fqc/hot-issues?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
      }
    } catch {} finally { setLoading(false); }
  }, [selectedMonth, activeBt]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // Auto-detect category from sub_defect
  const handleSubDefectChange = (val: string) => {
    const idx = SUBDEFECT_NAMES.indexOf(val);
    if (idx >= 0) {
      const cat = getSubDefectCategory(idx);
      setForm(prev => ({ ...prev, sub_defect: val, category: cat.category }));
    } else {
      setForm(prev => ({ ...prev, sub_defect: val, category: '' }));
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, issue_date: new Date().toISOString().split('T')[0], business_type: activeBt !== 'ALL' ? activeBt : 'PTOEM' });
    setDialogOpen(true);
  };

  const openEdit = (r: HotIssueRecord) => {
    setEditingId(r.id);
    setForm({
      issue_date: r.issue_date || '',
      business_type: r.business_type || '',
      category: r.category || '',
      sub_defect: r.sub_defect || '',
      defect_qty: r.defect_qty || 0,
      style_codes: (r.style_codes || []).join(', '),
      root_cause: r.root_cause || '',
      impact: r.impact || '',
      process: r.process || '',
      corrective_action: r.corrective_action || '',
      preventive_action: r.preventive_action || '',
      responsible: r.responsible || '',
      due_date: r.due_date || '',
      photo_before: r.photo_before || '',
      photo_after: r.photo_after || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.issue_date || !form.business_type || !form.sub_defect) {
      setMsg({ type: 'error', text: 'Date, Business Type, and Sub-Defect are required' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        ...form,
        defect_qty: Number(form.defect_qty) || 0,
        style_codes: form.style_codes ? form.style_codes.split(',').map(s => s.trim()).filter(Boolean) : [],
      };
      const url = editingId ? `/api/fqc/hot-issues/${editingId}` : '/api/fqc/hot-issues';
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setMsg({ type: 'success', text: editingId ? 'Hot issue updated' : 'Hot issue created' });
        setDialogOpen(false);
        fetchRecords();
      } else {
        const data = await res.json();
        setMsg({ type: 'error', text: data.error || 'Failed to save' });
      }
    } catch {
      setMsg({ type: 'error', text: 'Network error' });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this hot issue?')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/fqc/hot-issues/${id}`, { method: 'DELETE' });
      if (res.ok) { setRecords(prev => prev.filter(r => r.id !== id)); }
    } catch {} finally { setDeletingId(null); }
  };

  const handlePhotoUpload = async (field: 'photo_before' | 'photo_after', file: File) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('prefix', 'hotissue');
      const res = await fetch('/api/fqc/rca/upload-photo', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        setForm(prev => ({ ...prev, [field]: data.url }));
      }
    } catch {}
  };

  const [year, month] = selectedMonth.split('-').map(Number);
  const monthLabel = `${monthNames[month - 1]} ${year}`;

  const statusColor = (s: string) => {
    if (s === 'completed') return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (s === 'in_progress') return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-slate-500 bg-slate-50 border-slate-200';
  };
  const statusIcon = (s: string) => {
    if (s === 'completed') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    if (s === 'in_progress') return <Clock className="h-3.5 w-3.5 text-amber-500" />;
    return <XCircle className="h-3.5 w-3.5 text-slate-400" />;
  };

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
            {canEdit && (
              <Button onClick={openCreate} size="sm" className="h-9 bg-orange-600 hover:bg-orange-700">
                <Plus className="h-3.5 w-3.5 mr-1" /> {isZhMode ? '新增 Hot Issue' : 'Add Hot Issue'}
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

      {/* Stats */}
      <div className="flex items-center gap-2">
        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" /> {monthLabel}
        </h2>
        <Badge variant="outline" className="text-xs text-orange-600 border-orange-200 bg-orange-50">
          {records.length} {isZhMode ? '条 Hot Issue' : 'Hot Issue(s)'}
        </Badge>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
      ) : records.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/30 px-4 py-12 text-center">
          <Flame className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">{isZhMode ? '暂无 Hot Issue' : 'No hot issues this month'}</p>
          {canEdit && <p className="text-xs text-slate-400 mt-1">Click &quot;Add Hot Issue&quot; to create one</p>}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table className="[&_td]:whitespace-normal [&_td]:break-words" style={{ tableLayout: 'fixed', minWidth: '900px' }}>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="text-[10px] w-[8%]">Date</TableHead>
                <TableHead className="text-[10px] w-[8%]">BT</TableHead>
                <TableHead className="text-[10px] w-[6%]">Category</TableHead>
                <TableHead className="text-[10px] w-[14%]">{isZhMode ? '子缺陷' : 'Sub-Defect'}</TableHead>
                <TableHead className="text-[10px] w-[5%]">Qty</TableHead>
                <TableHead className="text-[10px] w-[14%]">{t('rca.rootCause')}</TableHead>
                <TableHead className="text-[10px] w-[10%]">{t('rca.correctiveAction')}</TableHead>
                <TableHead className="text-[10px] w-[7%]">{t('rca.responsible')}</TableHead>
                <TableHead className="text-[10px] w-[7%]">{t('rca.deadline')}</TableHead>
                <TableHead className="text-[10px] w-[6%]">Status</TableHead>
                <TableHead className="text-[10px] w-[10%] text-center">Photos</TableHead>
                {canEdit && <TableHead className="text-[10px] w-[5%]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => (
                <TableRow key={r.id} className="hover:bg-orange-50/30">
                  <TableCell className="text-[11px]">{r.issue_date}</TableCell>
                  <TableCell className="text-[11px]">
                    <Badge variant="outline" className={`text-[9px] ${BT_COLORS[r.business_type] || ''}`}>{(r.business_type || '').replace('PT', '')}</Badge>
                  </TableCell>
                  <TableCell className="text-[11px] text-slate-600">{isZhMode ? (CATEGORY_ZH[r.category || ''] || r.category) : r.category}</TableCell>
                  <TableCell className="text-[11px] font-medium text-slate-800">
                    {isZhMode ? (SUBDEFECT_ZH_MAP[r.sub_defect] || r.sub_defect) : r.sub_defect}
                  </TableCell>
                  <TableCell className="text-[11px] font-bold text-red-600">{r.defect_qty || 0}</TableCell>
                  <TableCell className="text-[11px] text-slate-600 leading-snug">{r.root_cause || '-'}</TableCell>
                  <TableCell className="text-[11px] text-slate-600 leading-snug">{r.corrective_action || '-'}</TableCell>
                  <TableCell className="text-[11px]">{r.responsible || '-'}</TableCell>
                  <TableCell className="text-[11px]">{r.due_date || '-'}</TableCell>
                  <TableCell className="text-[11px]">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium border ${statusColor(r.status)}`}>
                      {statusIcon(r.status)}
                      {r.status === 'completed' ? t('rca.statusCompleted') : r.status === 'in_progress' ? t('rca.statusInProgress') : t('rca.statusPending')}
                    </span>
                  </TableCell>
                  <TableCell className="text-[11px]">
                    <div className="flex gap-1">
                      <div className="w-[32px] h-[24px] rounded border border-slate-200 overflow-hidden bg-slate-50">
                        {r.photo_before ? <img src={r.photo_before} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300 text-[6px]">B</div>}
                      </div>
                      <div className="w-[32px] h-[24px] rounded border border-slate-200 overflow-hidden bg-slate-50">
                        {r.photo_after ? <img src={r.photo_after} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300 text-[6px]">A</div>}
                      </div>
                    </div>
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-[11px]">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(r)} className="p-1 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDelete(r.id)} disabled={deletingId === r.id} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-500" />
              {editingId ? (isZhMode ? '编辑 Hot Issue' : 'Edit Hot Issue') : (isZhMode ? '新增 Hot Issue' : 'New Hot Issue')}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {/* Row 1: Date + BT */}
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('common.date')} *</label>
              <Input type="date" className="h-9 text-sm" value={form.issue_date} onChange={(e) => setForm(p => ({ ...p, issue_date: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('fqc.businessType')} *</label>
              <Select value={form.business_type} onValueChange={(v) => setForm(p => ({ ...p, business_type: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{BUSINESS_TYPES.map(bt => <SelectItem key={bt} value={bt}>{bt.replace('PT', '')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {/* Row 2: Sub-Defect + Qty */}
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">{isZhMode ? '子缺陷' : 'Sub-Defect'} *</label>
              <Select value={form.sub_defect} onValueChange={handleSubDefectChange}>
                <SelectTrigger className="h-9"><SelectValue placeholder={isZhMode ? '选择子缺陷...' : 'Select sub-defect...'} /></SelectTrigger>
                <SelectContent>
                  {SUBDEFECT_OPTIONS.map((opt, i) => (
                    <SelectItem key={i} value={opt.value}>
                      <span className="text-[10px] text-slate-400">[{opt.categoryZh}/{opt.category}]</span>{' '}
                      {isZhMode ? (SUBDEFECT_NAMES_ZH[SUBDEFECT_NAMES.indexOf(opt.value)] || opt.value) : opt.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('rca.defectCount')}</label>
              <Input type="number" className="h-9 text-sm" value={form.defect_qty} onChange={(e) => setForm(p => ({ ...p, defect_qty: Number(e.target.value) || 0 }))} />
            </div>
            {/* Row 3: Style Codes */}
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600 mb-1 block">{isZhMode ? '款号 (逗号分隔)' : 'Style Codes (comma-separated)'}</label>
              <Input className="h-9 text-sm" value={form.style_codes} onChange={(e) => setForm(p => ({ ...p, style_codes: e.target.value }))} placeholder="STYLE-001, STYLE-002" />
            </div>
            {/* Row 4-5: Root Cause + Impact */}
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('rca.rootCause')}</label>
              <Textarea className="min-h-[60px] text-xs p-2" value={form.root_cause} onChange={(e) => setForm(p => ({ ...p, root_cause: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('rca.impact')}</label>
              <Textarea className="min-h-[60px] text-xs p-2" value={form.impact} onChange={(e) => setForm(p => ({ ...p, impact: e.target.value }))} />
            </div>
            {/* Row 6: Process */}
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('rca.process')}</label>
              <Input className="h-9 text-sm" value={form.process} onChange={(e) => setForm(p => ({ ...p, process: e.target.value }))} />
            </div>
            {/* Row 7-8: Corrective + Preventive */}
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('rca.correctiveAction')}</label>
              <Textarea className="min-h-[60px] text-xs p-2" value={form.corrective_action} onChange={(e) => setForm(p => ({ ...p, corrective_action: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('rca.preventiveAction')}</label>
              <Textarea className="min-h-[60px] text-xs p-2" value={form.preventive_action} onChange={(e) => setForm(p => ({ ...p, preventive_action: e.target.value }))} />
            </div>
            {/* Row 9: Responsible + Due Date */}
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('rca.responsible')}</label>
              <Input className="h-9 text-sm" value={form.responsible} onChange={(e) => setForm(p => ({ ...p, responsible: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('rca.deadline')}</label>
              <Input type="date" className="h-9 text-sm" value={form.due_date} onChange={(e) => setForm(p => ({ ...p, due_date: e.target.value }))} />
            </div>
            {/* Row 10: Photos */}
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('rca.photoBefore')}</label>
              <PhotoThumbnail value={form.photo_before} onUpload={(f) => handlePhotoUpload('photo_before', f)} onRemove={() => setForm(p => ({ ...p, photo_before: '' }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('rca.photoAfter')}</label>
              <PhotoThumbnail value={form.photo_after} onUpload={(f) => handlePhotoUpload('photo_after', f)} onRemove={() => setForm(p => ({ ...p, photo_after: '' }))} />
            </div>
          </div>
          {/* Actions */}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('action.cancel')}</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-orange-600 hover:bg-orange-700">
              {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Saving...</> : <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> {t('action.save')}</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const SUBDEFECT_ZH_MAP: Record<string, string> = {};
SUBDEFECT_NAMES.forEach((name, idx) => {
  if (SUBDEFECT_NAMES_ZH[idx]) SUBDEFECT_ZH_MAP[name] = SUBDEFECT_NAMES_ZH[idx];
});
