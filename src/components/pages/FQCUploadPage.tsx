'use client';

import { useState, useRef, useCallback } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Loader2, Layers } from 'lucide-react';

interface SheetResult {
  date: string;
  sheetName: string;
  recordCount: number;
  oqcGenerated: boolean;
  ipqcGenerated: number;
}

interface UploadResult {
  success: boolean;
  message: string;
  totalRecords?: number;
  sheets?: SheetResult[];
  partialErrors?: string[];
}

export default function FQCUploadPage() {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [debugInfo, setDebugInfo] = useState<Record<string, unknown> | null>(null);

  const handleFile = (f: File) => {
    if (!f.name.match(/\.xlsx?$/i)) {
      setResult({ success: false, message: t('fqc.upload.error') });
      return;
    }
    setFile(f);
    setResult(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [t]);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setResult(null);
    setDebugInfo(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const interval = setInterval(() => {
        setProgress((p) => Math.min(p + 10, 90));
      }, 200);

      const res = await fetch('/api/fqc/upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(interval);
      setProgress(100);

      const data = await res.json();
      if (res.ok || res.status === 201) {
        const upload = data.upload || {};
        const sheetCount = upload.sheet_count || 1;
        const totalRecords = upload.inspection_count || 0;
        const isMulti = sheetCount > 1;

        setResult({
          success: data.errors?.length !== sheetCount,
          message: isMulti
            ? t('upload.multiSheetSuccess').replace('{sheets}', String(sheetCount)).replace('{records}', String(totalRecords))
            : t('fqc.upload.success'),
          totalRecords,
          sheets: upload.sheets || undefined,
          partialErrors: data.errors || undefined,
        });
        setFile(null);
        // Auto-generate RCA for affected Mon-Sat periods
        try {
          await fetch('/api/fqc/rca', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'auto-generate' }),
          });
        } catch { /* silent */ }
      } else {
        setResult({ success: false, message: data.error || t('fqc.upload.error') });
        if (data.debug) setDebugInfo(data.debug);
      }
    } catch {
      setResult({ success: false, message: t('login.error.network') });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Card>
        <CardContent className="p-6">
          {/* Info banner */}
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700">
            <Layers className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{t('upload.multiSheetInfo')}</span>
          </div>

          {/* Drop Zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
              dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300 bg-slate-50'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <FileSpreadsheet className="h-12 w-12 text-emerald-500" />
                <p className="text-sm font-medium text-slate-700">{file.name}</p>
                <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-12 w-12 text-slate-300" />
                <p className="text-sm text-slate-600">{t('fqc.upload.dragDrop')}</p>
                <p className="text-xs text-slate-400">{t('fqc.upload.supportedFormat')}</p>
              </div>
            )}
          </div>

          {/* Upload Button */}
          {file && (
            <div className="mt-4 space-y-3">
              <Button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full h-11 bg-slate-900 hover:bg-slate-800"
              >
                {uploading ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t('fqc.upload.processing')}</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" />{t('fqc.upload')}</>
                )}
              </Button>
              {uploading && <Progress value={progress} className="h-2" />}
            </div>
          )}

          {/* Result */}
          {result && (
            <Alert variant={result.success ? 'default' : 'destructive'} className="mt-4">
              {result.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              <AlertDescription>
                {result.message}
                {result.totalRecords !== undefined && (
                  <span className="ml-2 font-medium">({result.totalRecords} {t('common.records')})</span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Multi-sheet breakdown */}
          {result?.sheets && result.sheets.length > 1 && (
            <div className="mt-4 rounded-lg border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-600 border-b border-slate-200">
                {t('upload.sheetBreakdown')}
              </div>
              <div className="divide-y divide-slate-100">
                {result.sheets.map((s, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 text-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="font-medium text-slate-700">{s.date}</span>
                      <span className="text-slate-400">{s.sheetName}</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-500">
                      <span>{s.recordCount} {t('common.records')}</span>
                      {s.oqcGenerated && <span className="text-emerald-600">OQC</span>}
                      {s.ipqcGenerated > 0 && <span className="text-blue-600">IPQC {s.ipqcGenerated}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Partial errors (some sheets failed) */}
          {result?.partialErrors && result.partialErrors.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-700 mb-1">{t('upload.partialErrors')}</p>
              {result.partialErrors.map((err, i) => (
                <p key={i} className="text-xs text-amber-600">- {err}</p>
              ))}
            </div>
          )}

          {/* Debug Panel — shown when parsing fails */}
          {debugInfo && (
            <div className="mt-4 p-4 bg-slate-900 text-slate-200 rounded-lg text-xs font-mono overflow-auto max-h-96">
              <div className="text-amber-400 font-bold mb-2">Parse Debug Info:</div>
              <div>Sheet: {String(debugInfo.sheetName)} | Rows: {String(debugInfo.totalRows)} | Cols: {String(debugInfo.totalCols)}</div>
              <div>Data range: row {String(debugInfo.detectedDataStart)} to row {String(debugInfo.detectedDataEnd)}</div>
              {debugInfo.sampleDates && Array.isArray(debugInfo.sampleDates) && debugInfo.sampleDates.length > 0 && (
                <div className="mt-1">Sample dates: {JSON.stringify(debugInfo.sampleDates)}</div>
              )}
              {debugInfo.skippedRows && Array.isArray(debugInfo.skippedRows) && debugInfo.skippedRows.length > 0 && (
                <div className="mt-1">Skipped rows: {JSON.stringify(debugInfo.skippedRows)}</div>
              )}
              {debugInfo.firstRowCells && typeof debugInfo.firstRowCells === 'object' && (
                <div className="mt-2">
                  <div className="text-amber-300">First rows content:</div>
                  <pre className="whitespace-pre-wrap mt-1">{JSON.stringify(debugInfo.firstRowCells, null, 2)}</pre>
                </div>
              )}
              {debugInfo.errors && Array.isArray(debugInfo.errors) && debugInfo.errors.length > 0 && (
                <div className="mt-2 text-red-400">
                  <div className="font-bold">Errors:</div>
                  {debugInfo.errors.map((e: string, i: number) => (
                    <div key={i}>- {e}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
