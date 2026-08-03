'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CheckCircle2, AlertTriangle, XCircle, Package } from 'lucide-react';

export default function OQCRekapPage() {
  const { t } = useI18n();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [value, setValue] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [businessType, setBusinessType] = useState('ALL');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period, value });
      if (businessType !== 'ALL') params.set('business_type', businessType);
      const res = await fetch(`/api/oqc/rekap?${params}`);
      if (res.ok) setData(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [period, value, businessType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const dailyBreakdown = data?.daily_breakdown || [];

  return (
    <div className="space-y-4">
      {/* Period Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <Tabs value={period} onValueChange={setPeriod}>
              <TabsList className="bg-slate-100">
                <TabsTrigger value="month" className="text-xs">{t('time.thisMonth')}</TabsTrigger>
                <TabsTrigger value="quarter" className="text-xs">{t('time.thisQuarter')}</TabsTrigger>
                <TabsTrigger value="year" className="text-xs">{t('time.thisYear')}</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="w-full sm:w-40">
              <Input
                type={period === 'year' ? 'number' : 'month'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                min={period === 'year' ? '2020' : undefined}
                className="h-9"
              />
            </div>
            <div className="w-full sm:w-36">
              <Select value={businessType} onValueChange={setBusinessType}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('common.all')}</SelectItem>
                  <SelectItem value="PTOEM">PTOEM</SelectItem>
                  <SelectItem value="PTB2C">PTB2C</SelectItem>
                  <SelectItem value="PTGH">PTGH</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card><CardContent className="p-3 text-center">
          <p className="text-xs text-slate-500">{t('oqc.lotSize')}</p>
          <p className="text-lg font-bold">{(data?.total_lot_size || 0).toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xs text-slate-500">{t('oqc.sampleSize')}</p>
          <p className="text-lg font-bold">{(data?.total_sampled || 0).toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xs text-slate-500">{t('dashboard.totalPassRate')}</p>
          <p className="text-lg font-bold" style={{ color: (data?.avg_pass_rate || 0) >= 98 ? '#059669' : '#dc2626' }}>{data?.avg_pass_rate || 0}%</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1"><CheckCircle2 className="h-4 w-4 text-emerald-500" /></div>
          <p className="text-xs text-slate-500">{t('disposition.release')}</p>
          <p className="text-lg font-bold text-emerald-600">{data?.release_lots || 0}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1"><AlertTriangle className="h-4 w-4 text-amber-500" /></div>
          <p className="text-xs text-slate-500">{t('disposition.rework')}</p>
          <p className="text-lg font-bold text-amber-600">{data?.rework_lots || 0}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1"><XCircle className="h-4 w-4 text-red-500" /></div>
          <p className="text-xs text-slate-500">{t('disposition.hold')}</p>
          <p className="text-lg font-bold text-red-600">{data?.hold_lots || 0}</p>
        </CardContent></Card>
      </div>

      {/* Daily Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">{t('common.detail')} - {t('common.table')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="text-xs">{t('common.date')}</TableHead>
                  <TableHead className="text-xs text-right">Lots</TableHead>
                  <TableHead className="text-xs text-right">{t('oqc.lotSize')}</TableHead>
                  <TableHead className="text-xs text-right">{t('oqc.sampleSize')}</TableHead>
                  <TableHead className="text-xs text-right">{t('oqc.totalDefects')}</TableHead>
                  <TableHead className="text-xs text-right">{t('oqc.passRate')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                  ))
                ) : dailyBreakdown.length > 0 ? (
                  dailyBreakdown.map((d: any, i: number) => (
                    <TableRow key={i} className="hover:bg-slate-50">
                      <TableCell className="text-xs">{d.lot_date}</TableCell>
                      <TableCell className="text-xs text-right">{d.lot_count}</TableCell>
                      <TableCell className="text-xs text-right">{d.lot_size.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right">{d.sample_size.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right text-red-600 font-medium">{d.defects}</TableCell>
                      <TableCell className="text-xs text-right font-medium">
                        <span className={d.pass_rate < 98 ? 'text-red-600' : 'text-emerald-600'}>{d.pass_rate}%</span>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={6} className="text-center py-12 text-sm text-slate-400">{t('common.noData')}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Defect Category Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">B. {t('dashboard.defectDistribution')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="text-xs">{t('severity.critical')}</TableHead>
                  <TableHead className="text-xs">{t('severity.major')}</TableHead>
                  <TableHead className="text-xs">{t('severity.minor')}</TableHead>
                  <TableHead className="text-xs text-right">{t('oqc.totalDefects')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="font-medium bg-slate-50">
                  <TableCell className="text-xs text-red-600 font-bold">{data?.critical_defects || 0}</TableCell>
                  <TableCell className="text-xs text-amber-600 font-bold">{data?.major_defects || 0}</TableCell>
                  <TableCell className="text-xs">{data?.minor_defects || 0}</TableCell>
                  <TableCell className="text-xs text-right font-bold">{data?.total_defects || 0}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
