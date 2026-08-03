'use client';

import { useState, useRef, useCallback } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export default function FQCUploadPage() {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ success: boolean; message: string; records?: number } | null>(null);

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

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Simulate progress
      const interval = setInterval(() => {
        setProgress((p) => Math.min(p + 15, 90));
      }, 200);

      const res = await fetch('/api/fqc/upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(interval);
      setProgress(100);

      const data = await res.json();
      if (res.ok) {
        setResult({
          success: true,
          message: t('fqc.upload.success'),
          records: data.summary?.records_inserted || data.total_records || 0,
        });
        setFile(null);
      } else {
        setResult({ success: false, message: data.error || t('fqc.upload.error') });
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
                {result.records !== undefined && (
                  <span className="ml-2 font-medium">({result.records} {t('common.records')})</span>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
