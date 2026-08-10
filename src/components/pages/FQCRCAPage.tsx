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
  Pencil, Lock, FileText, Download,
} from 'lucide-react';
import { CATEGORY_ZH, SUBDEFECT_NAMES_ZH, SUBDEFECT_NAMES } from '@/lib/rca-generator';
import { SUBDEFECT_ACTION_TEMPLATES_ZH } from '@/lib/rca-subdefect-templates-zh';

const MONTH_NAMES_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const MONTH_NAMES_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/** Lookup: English sub-defect name → Mandarin */
const SUBDEFECT_ZH_MAP: Record<string, string> = {};
SUBDEFECT_NAMES.forEach((name, idx) => {
  if (SUBDEFECT_NAMES_ZH[idx]) SUBDEFECT_ZH_MAP[name] = SUBDEFECT_NAMES_ZH[idx];
});

/** Lookup zh RCA content for a given sub-defect name. Returns null if no zh template found. */
function getZhTemplate(subDefectName: string) {
  return SUBDEFECT_ACTION_TEMPLATES_ZH[subDefectName] || null;
}

/**
 * Replace 5 RCA content fields with zh template content (if available).
 * Used when isZhMode to show Mandarin content for auto-generated actions.
 */
function applyZhContent(action: ActionRow): ActionRow {
  const primarySub = action.sub_defects?.[0];
  if (!primarySub) return action;
  const zh = getZhTemplate(primarySub);
  if (!zh) return action;
  return {
    ...action,
    root_cause: zh.root_cause,
    impact: zh.impact,
    process: zh.process,
    corrective_action: zh.corrective_action,
    preventive_action: zh.preventive_action,
  };
}

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

function getWeekPeriods(year: number, month: number) {
  const periods: { start: string; end: string; weekNum: number }[] = [];
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const lastDate = new Date(year, month, 0).getDate();
  const monthIdx = month - 1;

  let current = new Date(year, monthIdx, 1);
  let weekNum = 1;

  while (current.getDate() <= lastDate && current.getMonth() === monthIdx) {
    const weekStart = new Date(current);
    let weekEnd = new Date(current);
    while (weekEnd.getDay() !== 6 && weekEnd.getDate() < lastDate) {
      weekEnd.setDate(weekEnd.getDate() + 1);
    }
    if (weekEnd.getMonth() !== monthIdx) {
      weekEnd = new Date(year, monthIdx, lastDate);
    }

    periods.push({ start: fmt(weekStart), end: fmt(weekEnd), weekNum });
    weekNum++;

    if (weekEnd.getDay() === 6) {
      current = new Date(weekEnd);
      current.setDate(weekEnd.getDate() + 2);
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

/**
 * Client-side image compression using Canvas API.
 * Resizes to max 600px, outputs JPEG at 45% quality.
 * Server will further compress to WebP.
 */
function compressImageClient(file: File, maxDim = 600, quality = 0.45): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('Compression failed')); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        },
        'image/jpeg',
        quality
      );
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
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

/** Initialize action edit rows from a draft RCA's actions array */
function buildActionEditsFromDraft(draft: any, zhMode: boolean): ActionRow[] {
  if (!draft.actions || draft.actions.length === 0) return [];
  let actions = draft.actions.map((a: any) => ({
    rank: a.rank, category: a.category || '', sub_defects: a.sub_defects || [],
    defect_qty: a.defect_qty || 0, style_codes: a.style_codes || [],
    root_cause: a.root_cause || '', impact: a.impact || '', process: a.process || '',
    corrective_action: a.corrective_action || '', preventive_action: a.preventive_action || '',
    responsible: a.responsible || '', due_date: a.due_date || '',
    status: a.status || 'pending', photo_before: a.photo_before || '', photo_after: a.photo_after || '',
  }));
  actions.sort((a, b) => a.rank - b.rank);
  if (zhMode) actions = actions.map(applyZhContent);
  return actions;
}

const DRAFTS_STORAGE_KEY = 'sula_qc_rca_drafts';

// ═══════════════════════════════════════════════════════════
// Photo Cell Component
// ═══════════════════════════════════════════════════════════
function PhotoCell({ value, onUpload, onRemove, disabled }: {
  value: string;
  onUpload: (file: File) => void;
  onRemove: (url: string) => void;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const localInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = ''; // reset so same file can be re-selected
    try {
      setUploading(true);
      // Client-side compression
      const compressed = await compressImageClient(f);
      onUpload(compressed);
    } catch (err) {
      console.error('Photo compress error:', err);
    } finally {
      setUploading(false);
    }
  };

  if (value) {
    return (
      <div
        className="relative group w-[72px] h-[54px] rounded border border-slate-200 overflow-hidden bg-slate-50 cursor-pointer"
        onClick={() => window.open(value, '_blank')}
      >
        <img src={value} alt="" className="w-full h-full object-cover" />
        {!disabled && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(value); }}
            className="absolute top-0 right-0 bg-red-500 text-white rounded-bl p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 pointer-events-none">
          <EyeIcon className="h-4 w-4 text-white" />
        </div>
      </div>
    );
  }

  if (disabled) {
    return (
      <div className="w-[72px] h-[54px] rounded border border-dashed border-slate-200 flex flex-col items-center justify-center gap-0.5 text-slate-300">
      <ImageIcon className="h-3.5 w-3.5" />
      <span className="text-[7px]">-</span>
    </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        onClick={() => localInputRef.current?.click()}
        disabled={uploading}
        className="w-[72px] h-[54px] rounded border border-dashed border-slate-300 flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/30 transition-colors disabled:opacity-50"
      >
        {uploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Camera className="h-3.5 w-3.5" />
        )}
        <span className="text-[7px]">{uploading ? '...' : 'Upload'}</span>
      </button>
      <input
        ref={localInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════
// Main RCA Page
// ═══════════════════════════════════════════════════════════
export default function FQCRCAPage() {
  const { t, lang } = useI18n();
  const isZhMode = lang === 'zh';
  const { isFullAccess, user } = useAuth();
  const isStaffQA = user?.role === 'staff_qa';
  const canEditRCA = isStaffQA || user?.role === 'manager_qc' || user?.role === 'manager_umum';
  const { effectiveType, isLocked } = useBusinessTypeLock();
  const monthNames = lang === 'zh' ? MONTH_NAMES_ID.map((m, i) => `${i + 1}月`) : MONTH_NAMES_EN;

  const [savedRecords, setSavedRecords] = useState<any[]>([]);
  const [draftRcas, setDraftRcas] = useState<any[]>([]);
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
  const [editingRcas, setEditingRcas] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  // ═══════════════════════════════════════════════════════════
  // Download Excel (3 sheets: FQC Daily + Analysis + RCA)
  // ═══════════════════════════════════════════════════════════
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const [y, m] = selectedMonth.split('-');
      const firstDay = `${selectedMonth}-01`;
      const lastDay = new Date(parseInt(y), parseInt(m), 0).toISOString().split('T')[0];
      const bt = effectiveType || 'ALL';

      const filters: Record<string, string> = {};
      filters.date_from = firstDay;
      filters.date_to = lastDay;
      if (bt !== 'ALL') filters.business_type = bt;

      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'rca-combined', filters }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Export failed');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SULA-QC_FQC_RCA_Report_${firstDay}_${lastDay}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // Persist drafts across navigation & refresh via sessionStorage
  // ═══════════════════════════════════════════════════════════

  // Load persisted drafts on first mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(DRAFTS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setDraftRcas(parsed);
          // Restore action edits from persisted drafts
          const edits: Record<string, ActionRow[]> = {};
          for (const draft of parsed) {
            if (draft.draft_id && draft.actions?.length > 0) {
              edits[draft.draft_id] = buildActionEditsFromDraft(draft, isZhMode);
            }
          }
          setActionEdits(prev => ({ ...prev, ...edits }));
          // Auto-expand loaded drafts
          setExpandedWeeks(prev => {
            const next = new Set(prev);
            parsed.forEach((d: any) => { if (d.draft_id) next.add(d.draft_id); });
            return next;
          });
        }
      }
    } catch { /* ignore parse errors */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync draft state → sessionStorage whenever drafts change
  useEffect(() => {
    try {
      if (draftRcas.length > 0) {
        sessionStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(draftRcas));
      } else {
        sessionStorage.removeItem(DRAFTS_STORAGE_KEY);
      }
    } catch { /* ignore storage quota errors */ }
  }, [draftRcas]);

  const months = useMemo(() => getRecentMonths(6), []);
  const [year, month] = selectedMonth.split('-').map(Number);
  const weekPeriods = useMemo(() => getWeekPeriods(year, month), [year, month]);
  const activeBt = effectiveType || 'ALL';

  // Build a composite ID for any RCA (saved or draft)
  const getRcaKey = (r: any) => r.is_draft ? r.draft_id : r.id;
  const isDraft = (r: any) => !!r.is_draft;

  // Combined list for display — sorted by week_start then business_type
  const allRcas = useMemo(() => {
    const saved = savedRecords.map(r => ({ ...r, _key: r.id }));
    const drafts = draftRcas.filter(d => {
      // Only show drafts for the selected month
      const ws = d.week_start || '';
      return ws.startsWith(selectedMonth);
    }).map(r => ({ ...r, _key: r.draft_id }));
    const combined = [...drafts, ...saved];
    combined.sort((a, b) => {
      if (a.week_start !== b.week_start) return (a.week_start || '').localeCompare(b.week_start || '');
      return (a.business_type || '').localeCompare(b.business_type || '');
    });
    return combined;
  }, [savedRecords, draftRcas, selectedMonth]);

  // Saved RCA map for quick lookup
  const savedMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const r of savedRecords) {
      const key = `${r.week_start}__${r.business_type || ''}`;
      map[key] = r;
    }
    return map;
  }, [savedRecords]);

  const fetchSavedRecords = useCallback(async () => {
 setLoading(true);
    try {
      const params = new URLSearchParams({ month: selectedMonth });
      if (activeBt !== 'ALL') params.set('business_type', activeBt);
      const res = await fetch(`/api/fqc/rca?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSavedRecords(data.records || []);
        // Auto-expand saved records
        const ids = new Set<string>((data.records || []).map((r: any) => String(r.id)));
        setExpandedWeeks(prev => {
          const next = new Set(prev);
          ids.forEach(id => next.add(id));
          return next;
        });
      }
    } catch { /* */ } finally {
      setLoading(false);
    }
  }, [selectedMonth, activeBt]);

  useEffect(() => { fetchSavedRecords(); }, [fetchSavedRecords]);

  const toggleWeek = (key: string) => {
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // ═══════════════════════════════════════════════════════════
  // Auto-Generate (produces drafts only — NO DB write)
  // ═══════════════════════════════════════════════════════════
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
        setMsg({ type: 'success', text: `${data.message}` });
        // Store draft RCAs in state
        if (data.draft_rcas && data.draft_rcas.length > 0) {
          setDraftRcas(prev => {
            // Replace any existing drafts for this month
            const filtered = prev.filter(d => !d.week_start?.startsWith(selectedMonth));
            return [...filtered, ...data.draft_rcas];
          });
          // Auto-expand drafts
          setExpandedWeeks(prev => {
            const next = new Set(prev);
            data.draft_rcas.forEach((d: any) => next.add(d.draft_id));
            return next;
          });
          // Initialize action edits from draft actions
          for (const draft of data.draft_rcas) {
            const key = draft.draft_id;
            if (draft.actions && draft.actions.length > 0 && !actionEdits[key]) {
              setActionEdits(prev => ({
                ...prev,
                [key]: buildActionEditsFromDraft(draft, isZhMode),
              }));
            }
          }
        }
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

  // ═══════════════════════════════════════════════════════════
  // Action edit management
  // ═══════════════════════════════════════════════════════════
  const getActionEdits = (rca: any): ActionRow[] => {
    const key = getRcaKey(rca);
    if (actionEdits[key]) return actionEdits[key];

    // For saved RCAs, load from DB actions
    if (!isDraft(rca) && rca.rca_actions && rca.rca_actions.length > 0) {
      let existing = rca.rca_actions.map((a: any) => ({
        rank: a.rank, category: a.category || '', sub_defects: a.sub_defects || [],
        defect_qty: a.defect_qty || 0, style_codes: a.style_codes || [],
        root_cause: a.root_cause || '', impact: a.impact || '', process: a.process || '',
        corrective_action: a.corrective_action || '', preventive_action: a.preventive_action || '',
        responsible: a.responsible || '', due_date: a.due_date || '',
        status: a.status || 'pending', photo_before: a.photo_before || '', photo_after: a.photo_after || '',
      }));
      // Sort actions by rank to ensure correct order
      existing.sort((a, b) => a.rank - b.rank);
      // When zh mode, replace content fields with Mandarin template content
      if (isZhMode) {
        existing = existing.map(applyZhContent);
      }
      setActionEdits(prev => ({ ...prev, [key]: existing }));
      return existing;
    }

    return [];
  };

  const updateActionField = (rcaKey: string, rank: number, field: keyof ActionRow, value: string | number | string[]) => {
    setActionEdits(prev => {
      const actions = [...(prev[rcaKey] || [])];
      const idx = actions.findIndex(a => a.rank === rank);
      if (idx >= 0) actions[idx] = { ...actions[idx], [field]: value };
      return { ...prev, [rcaKey]: actions };
    });
  };

  // ═══════════════════════════════════════════════════════════
  // Save (draft → DB)
  // ═══════════════════════════════════════════════════════════
  const handleSave = async (rca: any) => {
    const key = getRcaKey(rca);
    const actions = actionEdits[key] || getActionEdits(rca);
    if (actions.length === 0) return;
    setSavingId(key);
    try {
      if (isDraft(rca)) {
        // Save draft → create new DB record
        const res = await fetch('/api/fqc/rca', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'save-draft',
            week_start: rca.week_start,
            week_end: rca.week_end,
            business_type: rca.business_type,
            total_inspections: rca.total_inspections,
            total_inspected: rca.total_inspected,
            total_ok: rca.total_ok,
            total_ng: rca.total_ng,
            overall_pass_rate: rca.overall_pass_rate,
            top_categories: rca.top_categories,
            top_sub_defects: rca.top_sub_defects,
            top_styles: rca.top_styles,
            actions,
          }),
        });
        if (res.ok) {
          setMsg({ type: 'success', text: t('common.success') });
          // Remove from drafts, refetch saved
          setDraftRcas(prev => prev.filter(d => d.draft_id !== rca.draft_id));
          setEditingRcas(prev => { const next = new Set(prev); next.delete(key); return next; });
          fetchSavedRecords();
        } else {
          const data = await res.json();
          setMsg({ type: 'error', text: data.error || t('common.error') });
        }
      } else {
        // Update existing saved RCA
        const res = await fetch(`/api/fqc/rca/${rca.id}/actions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actions }),
        });
        if (res.ok) {
          setMsg({ type: 'success', text: t('common.success') });
          setEditingRcas(prev => { const next = new Set(prev); next.delete(key); return next; });
          fetchSavedRecords();
        } else {
          setMsg({ type: 'error', text: t('common.error') });
        }
      }
    } catch {
      setMsg({ type: 'error', text: t('common.error') });
    } finally {
      setSavingId(null);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // Photo upload to Supabase Storage
  // ═══════════════════════════════════════════════════════════
  const deletePhotoFromStorage = (url: string) => {
    if (url) {
      fetch(`/api/fqc/rca/upload-photo?url=${encodeURIComponent(url)}`, { method: 'DELETE' }).catch(() => {});
    }
  };

  const handlePhotoUpload = async (rcaKey: string, rank: number, field: 'photo_before' | 'photo_after', file: File) => {
    try {
      // Delete old photo from storage before uploading new one
      const actions = actionEdits[rcaKey];
      const oldAction = actions?.find((a: any) => a.rank === rank);
      if (oldAction?.[field]) deletePhotoFromStorage(oldAction[field]);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('prefix', 'rca');
      const res = await fetch('/api/fqc/rca/upload-photo', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        updateActionField(rcaKey, rank, field, data.url);
      } else {
        console.error('Photo upload failed');
      }
    } catch (err) {
      console.error('Photo upload error:', err);
    }
  };

  const handlePhotoRemove = (rcaKey: string, rank: number, field: 'photo_before' | 'photo_after', currentUrl: string) => {
    deletePhotoFromStorage(currentUrl);
    updateActionField(rcaKey, rank, field, '');
  };

  // ═══════════════════════════════════════════════════════════
  // Edit/Lock toggle
  // ═══════════════════════════════════════════════════════════
  const toggleEdit = (rca: any) => {
    const key = getRcaKey(rca);
    setEditingRcas(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key); // lock
      } else {
        next.add(key); // edit
        // Ensure action edits are loaded
        getActionEdits(rca);
      }
      return next;
    });
  };

  const isEditing = (rca: any) => {
    const key = getRcaKey(rca);
    // Drafts are always in edit mode
    if (isDraft(rca)) return true;
    // Saved RCAs are in edit mode only if explicitly toggled
    return editingRcas.has(key);
  };

  const zhCategory = (cat: string) => (isZhMode ? (CATEGORY_ZH[cat] || cat) : cat);
  const zhSubDefect = (sub: string) => (isZhMode ? (SUBDEFECT_ZH_MAP[sub] || sub) : sub);



  const monthLabel = `${monthNames[month - 1]} ${year}`;
  const savedCount = savedRecords.length;
  const draftCount = draftRcas.filter(d => d.week_start?.startsWith(selectedMonth)).length;

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
            {isStaffQA && (
              <Button onClick={handleAutoGenerate} disabled={generating} size="sm" className="h-9 bg-slate-900 hover:bg-slate-800">
                {generating
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> {t('rca.generating')}</>
                  : <><Plus className="h-3.5 w-3.5 mr-1" /> {t('rca.autoGenerate')}</>}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={fetchSavedRecords} className="h-9">
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> {t('action.refresh')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={exporting || savedCount === 0}
              className="h-9"
            >
              {exporting
                ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> {t('action.export')}...</>
                : <><Download className="h-3.5 w-3.5 mr-1" /> {t('action.download')}</>}
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
            <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200">{savedCount} {t('rca.hasRCA')}</Badge>
            {draftCount > 0 && (
              <Badge variant="outline" className="text-xs text-orange-500 border-orange-200">{draftCount} {lang === 'zh' ? '草稿' : 'Draft'}</Badge>
            )}
          </div>

          <div className="space-y-3">
            {weekPeriods.map((wp) => {
              // Find all RCAs (draft + saved) for this week period
              const weekRcas = allRcas.filter((r) => r.week_start === wp.start && r.week_end === wp.end);
              const anyExpanded = weekRcas.some((r) => expandedWeeks.has(getRcaKey(r)));

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
                      <Badge key={getRcaKey(r)} variant="outline" className={`text-[10px] ${BT_COLORS[r.business_type || ''] || 'bg-slate-100 text-slate-600'}${r.is_draft ? ' border-dashed border-orange-300' : ''}`}>
                        {BT_SHORT[r.business_type || ''] || r.business_type || 'ALL'}
                        {r.is_draft && <span className="ml-1 text-orange-400">*</span>}
                      </Badge>
                    ))}
                    {weekRcas.length === 0 && (
                      <span className="text-[10px] text-slate-400">{t('rca.noData')}</span>
                    )}
                  </div>

                  {/* RCA cards */}
                  {weekRcas.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/30 px-4 py-6 text-center">
                      <p className="text-xs text-slate-400">{t('rca.noData')}</p>
                    </div>
                  ) : (
                    weekRcas.map((rca) => {
                      const key = getRcaKey(rca);
                      const isExp = expandedWeeks.has(key);
                      const bt = rca.business_type || '';
                      const btColor = BT_COLORS[bt] || 'bg-slate-100 text-slate-600';
                      const editing = isEditing(rca);

                      return (
                        <Collapsible key={key} open={isExp} onOpenChange={() => toggleWeek(key)}>
                          <div className={`rounded-lg border ${rca.is_draft ? 'border-orange-200 bg-orange-50/20' : 'border-slate-200 bg-white'}`}>
                            <CollapsibleTrigger asChild>
                              <button className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50/50 transition-colors cursor-pointer">
                                <Badge variant="outline" className={`text-[10px] font-semibold ${btColor}`}>
                                  {BT_SHORT[bt] || bt}
                                </Badge>
                                <div className="hidden sm:flex items-center gap-4 text-xs flex-1">
                                  <span className="text-slate-400">{t('rca.totalInspected')}: <b className="text-slate-700">{(rca.total_inspected || 0).toLocaleString()}</b></span>
                                  <span className="text-slate-400">NG: <b className="text-red-600">{(rca.total_ng || 0).toLocaleString()}</b></span>
                                  <span className="text-slate-400">{t('rca.overallPassRate')}: <b className={`${(rca.overall_pass_rate || 0) >= 95 ? 'text-emerald-600' : 'text-red-600'}`}>{rca.overall_pass_rate}%</b></span>
                                </div>

                                {isExp ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
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

                                {/* Top 3 Sub-Defects */}
                                {(rca.top_sub_defects || []).length > 0 && (
                                  <div>
                                    <h4 className="text-xs font-semibold text-slate-600 mb-2">{isZhMode ? '前3项子缺陷' : 'Top 3 Sub-Defects'}</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                      {(rca.top_sub_defects || []).slice(0, 3).map((s: any, si: number) => (
                                        <div key={si} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                                          <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-1.5">
                                              <span className="text-xs font-bold text-slate-700">#{si + 1}</span>
                                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">{zhCategory(s.category || '')}</span>
                                            </div>
                                            <span className="text-xs font-bold text-red-600">{s.defectCount || s.count}</span>
                                          </div>
                                          <span className="text-[11px] text-slate-600 leading-tight block">{zhSubDefect(s.subDefect || s.name || '')}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Action Items */}
                                {canEditRCA && (
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <h4 className="text-xs font-semibold text-slate-600">{t('rca.actionItems')}</h4>
                                      {canEditRCA && !editing && !isDraft(rca) && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-7 text-xs gap-1"
                                          onClick={(e) => { e.stopPropagation(); toggleEdit(rca); }}
                                        >
                                          <Pencil className="h-3 w-3" />
                                          {t('action.edit')}
                                        </Button>
                                      )}
                                      {editing && !isDraft(rca) && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 text-xs gap-1 text-slate-500"
                                          onClick={(e) => { e.stopPropagation(); toggleEdit(rca); }}
                                        >
                                          <Lock className="h-3 w-3" />
                                          {lang === 'zh' ? '锁定' : 'Lock'}
                                        </Button>
                                      )}
                                    </div>

                                    {editing ? (
                                      <>
                                        {/* EDIT MODE */}
                                        <div className="rounded-lg border overflow-hidden">
                                        <Table className="[&_td]:whitespace-normal [&_td]:break-words [&_th]:whitespace-normal" style={{ tableLayout: 'fixed', minWidth: '760px' }}>
                                          <TableHeader className="bg-slate-50">
                                            <TableRow>
                                              <TableHead className="text-[10px] w-[4%]">#</TableHead>
                                              <TableHead className="text-[10px] w-[15%]">{t('rca.rootCause')}</TableHead>
                                              <TableHead className="text-[10px] w-[12%]">{t('rca.impact')}</TableHead>
                                              <TableHead className="text-[10px] w-[8%]">{t('rca.process')}</TableHead>
                                              <TableHead className="text-[10px] w-[15%]">{t('rca.correctiveAction')}</TableHead>
                                              <TableHead className="text-[10px] w-[15%]">{t('rca.preventiveAction')}</TableHead>
                                              <TableHead className="text-[10px] w-[7%]">{t('rca.responsible')}</TableHead>
                                              <TableHead className="text-[10px] w-[8%]">{t('rca.deadline')}</TableHead>
                                              <TableHead className="text-[10px] w-[8%] text-center">{t('rca.photoBefore')}</TableHead>
                                              <TableHead className="text-[10px] w-[8%] text-center">{t('rca.photoAfter')}</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {getActionEdits(rca).map((action) => (
                                              <TableRow key={action.rank}>
                                                <TableCell className="text-[11px] font-bold text-slate-500">
                                                  <div className="flex flex-col items-center">
                                                    <span>{action.rank}</span>
                                                    <span className="text-[8px] text-slate-400 normal-case">{zhCategory(action.category)}</span>
                                                  </div>
                                                </TableCell>
                                                <TableCell className="text-[11px]"><Textarea className="min-h-[34px] text-[11px] p-1.5 leading-snug resize-y" value={action.root_cause} onChange={(e) => updateActionField(key, action.rank, 'root_cause', e.target.value)} /></TableCell>
                                                <TableCell className="text-[11px]"><Textarea className="min-h-[34px] text-[11px] p-1.5 leading-snug resize-y" value={action.impact} onChange={(e) => updateActionField(key, action.rank, 'impact', e.target.value)} /></TableCell>
                                                <TableCell className="text-[11px]"><Input className="h-7 text-[11px]" value={action.process} onChange={(e) => updateActionField(key, action.rank, 'process', e.target.value)} /></TableCell>
                                                <TableCell className="text-[11px]"><Textarea className="min-h-[34px] text-[11px] p-1.5 leading-snug resize-y" value={action.corrective_action} onChange={(e) => updateActionField(key, action.rank, 'corrective_action', e.target.value)} /></TableCell>
                                                <TableCell className="text-[11px]"><Textarea className="min-h-[34px] text-[11px] p-1.5 leading-snug resize-y" value={action.preventive_action} onChange={(e) => updateActionField(key, action.rank, 'preventive_action', e.target.value)} /></TableCell>
                                                <TableCell className="text-[11px]"><Input className="h-7 text-[11px]" value={action.responsible} onChange={(e) => updateActionField(key, action.rank, 'responsible', e.target.value)} /></TableCell>
                                                <TableCell className="text-[11px]"><Input type="date" className="h-7 text-[11px]" value={action.due_date} onChange={(e) => updateActionField(key, action.rank, 'due_date', e.target.value)} /></TableCell>
                                                <TableCell className="text-[11px]">
                                                  <PhotoCell
                                                    value={action.photo_before}
                                                    onUpload={(file) => handlePhotoUpload(key, action.rank, 'photo_before', file)}
                                                    onRemove={(url) => handlePhotoRemove(key, action.rank, 'photo_before', url)}
                                                  />
                                                </TableCell>
                                                <TableCell className="text-[11px]">
                                                  <PhotoCell
                                                    value={action.photo_after}
                                                    onUpload={(file) => handlePhotoUpload(key, action.rank, 'photo_after', file)}
                                                    onRemove={(url) => handlePhotoRemove(key, action.rank, 'photo_after', url)}
                                                  />
                                                </TableCell>
                                              </TableRow>
                                            ))}
                                            {getActionEdits(rca).length === 0 && (
                                              <TableRow>
                                                <TableCell colSpan={10} className="text-center py-4 text-[11px] text-slate-400">{t('rca.noActionItems')}</TableCell>
                                              </TableRow>
                                            )}
                                          </TableBody>
                                        </Table>
                                        </div>
                                        <div className="mt-3 flex justify-end">
                                          <Button onClick={() => handleSave(rca)} disabled={savingId === key} size="sm" className="bg-slate-900 hover:bg-slate-800">
                                            {savingId === key
                                              ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> {t('action.save')}...</>
                                              : <><Save className="h-3.5 w-3.5 mr-1" /> {t('action.save')}</>}
                                          </Button>
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        {/* LOCK MODE (read-only) */}
                                        {getActionEdits(rca).length > 0 ? (
                                          <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50/30">
                                          <Table className="[&_td]:whitespace-normal [&_td]:break-words [&_th]:whitespace-normal" style={{ tableLayout: 'fixed', minWidth: '760px' }}>
                                            <TableHeader className="bg-slate-100/60">
                                              <TableRow>
                                                <TableHead className="text-[10px] w-[4%]">#</TableHead>
                                                <TableHead className="text-[10px] w-[15%]">{t('rca.rootCause')}</TableHead>
                                                <TableHead className="text-[10px] w-[12%]">{t('rca.impact')}</TableHead>
                                                <TableHead className="text-[10px] w-[8%]">{t('rca.process')}</TableHead>
                                                <TableHead className="text-[10px] w-[15%]">{t('rca.correctiveAction')}</TableHead>
                                                <TableHead className="text-[10px] w-[15%]">{t('rca.preventiveAction')}</TableHead>
                                                <TableHead className="text-[10px] w-[7%]">{t('rca.responsible')}</TableHead>
                                                <TableHead className="text-[10px] w-[8%]">{t('rca.deadline')}</TableHead>
                                                <TableHead className="text-[10px] w-[8%] text-center">{t('rca.photoBefore')}</TableHead>
                                                <TableHead className="text-[10px] w-[8%] text-center">{t('rca.photoAfter')}</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {getActionEdits(rca).map((action) => (
                                                <TableRow key={action.rank} className="bg-white">
                                                  <TableCell className="text-[11px] font-bold text-slate-500">
                                                    <div className="flex flex-col items-center">
                                                      <span>{action.rank}</span>
                                                      <span className="text-[8px] text-slate-400 normal-case">{zhCategory(action.category)}</span>
                                                    </div>
                                                  </TableCell>
                                                  <TableCell className="text-[11px] text-slate-700 leading-snug">{action.root_cause || '-'}</TableCell>
                                                  <TableCell className="text-[11px] text-slate-700 leading-snug">{action.impact || '-'}</TableCell>
                                                  <TableCell className="text-[11px] text-slate-700">{action.process || '-'}</TableCell>
                                                  <TableCell className="text-[11px] text-slate-700 leading-snug">{action.corrective_action || '-'}</TableCell>
                                                  <TableCell className="text-[11px] text-slate-700 leading-snug">{action.preventive_action || '-'}</TableCell>
                                                  <TableCell className="text-[11px] text-slate-700">{action.responsible || '-'}</TableCell>
                                                  <TableCell className="text-[11px] text-slate-700">{action.due_date || '-'}</TableCell>
                                                  <TableCell className="text-[11px]">
                                                    <PhotoCell
                                                      value={action.photo_before}
                                                      onUpload={() => {}}
                                                      onRemove={(_url) => {}}
                                                      disabled
                                                    />
                                                  </TableCell>
                                                  <TableCell className="text-[11px]">
                                                    <PhotoCell
                                                      value={action.photo_after}
                                                      onUpload={() => {}}
                                                      onRemove={(_url) => {}}
                                                      disabled
                                                    />
                                                  </TableCell>
                                                </TableRow>
                                              ))}
                                            </TableBody>
                                          </Table>
                                          </div>
                                        ) : (
                                          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/30 px-4 py-6 text-center">
                                            <p className="text-xs text-slate-400">{t('rca.noActionItems')}</p>
                                          </div>
                                        )}
                                      </>
                                    )}
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
