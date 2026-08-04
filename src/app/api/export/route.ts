import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest, getRoleLanguage } from '@/lib/auth';
import {
  exportFQCDailyExcel,
  exportFQCAnalysisExcel,
  exportFQCOQCExcel,
  exportIPQCExcel,
  type ExportFilters,
} from '@/lib/excel-export';

type ExportType = 'fqc-daily' | 'fqc-analysis' | 'oqc' | 'ipqc';

const VALID_TYPES: ExportType[] = ['fqc-daily', 'fqc-analysis', 'oqc', 'ipqc'];

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, 'view');
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { type, filters = {} } = body as {
      type: ExportType;
      filters: Record<string, string>;
    };

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        {
          error:
            "type must be 'fqc-daily', 'fqc-analysis', 'oqc', or 'ipqc'",
        },
        { status: 400 },
      );
    }

    const lang = getRoleLanguage(auth.user!.role);
    const dateFrom = filters.dateFrom || filters.date_from;
    const dateTo = filters.dateTo || filters.date_to;
    const businessType = filters.businessType || filters.business_type;
    const productionLine = filters.productionLine || filters.production_line;
    const period = filters.period;

    const exportFilters: ExportFilters = {
      dateFrom,
      dateTo,
      businessType,
      period,
      productionLine,
    };

    let data: Record<string, unknown>[];

    if (type === 'fqc-daily') {
      let query = adminClient
        .from('fqc_inspections')
        .select('*')
        .order('inspection_date', { ascending: false });

      if (dateFrom) query = query.gte('inspection_date', dateFrom);
      if (dateTo) query = query.lte('inspection_date', dateTo);
      if (businessType) query = query.eq('business_type', businessType);
      if (productionLine) query = query.ilike('production_line', `%${productionLine}%`);

      const { data: records, error } = await query;
      if (error) {
        return NextResponse.json(
          { error: 'Failed to export FQC daily data' },
          { status: 500 },
        );
      }
      data = (records as Record<string, unknown>[]) || [];

      let result: { buffer: Uint8Array; fileName: string };
      try {
        result = await exportFQCDailyExcel(data, exportFilters, lang);
      } catch (xlsErr) {
        console.error('XLSX generation error:', xlsErr);
        return NextResponse.json(
          { error: `Excel generation failed: ${xlsErr instanceof Error ? xlsErr.message : String(xlsErr)}` },
          { status: 500 },
        );
      }

      return new NextResponse(Buffer.from(result.buffer), {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(result.fileName)}"`,
          'Cache-Control': 'no-cache',
        },
      });
    }

    if (type === 'fqc-analysis') {
      let query = adminClient.from('fqc_inspections').select('*');

      if (dateFrom) query = query.gte('inspection_date', dateFrom);
      if (dateTo) query = query.lte('inspection_date', dateTo);
      if (businessType) query = query.eq('business_type', businessType);

      const { data: records, error } = await query;
      if (error) {
        return NextResponse.json(
          { error: 'Failed to export FQC analysis data' },
          { status: 500 },
        );
      }
      data = (records as Record<string, unknown>[]) || [];

      const result = exportFQCAnalysisExcel(data, exportFilters, lang);

      return new NextResponse(Buffer.from(result.buffer), {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(result.fileName)}"`,
          'Cache-Control': 'no-cache',
        },
      });
    }

    if (type === 'oqc') {
      let query = adminClient
        .from('oqc_daily_lots')
        .select(
          `
          *,
          oqc_lot_orders (*),
          oqc_defects (*)
        `,
        )
        .order('lot_date', { ascending: false });

      if (dateFrom) query = query.gte('lot_date', dateFrom);
      if (dateTo) query = query.lte('lot_date', dateTo);
      if (businessType) query = query.eq('business_type', businessType);

      const { data: records, error } = await query;
      if (error) {
        return NextResponse.json(
          { error: 'Failed to export OQC data' },
          { status: 500 },
        );
      }
      data = (records as Record<string, unknown>[]) || [];

      const result = exportFQCOQCExcel(data, exportFilters, lang);

      return new NextResponse(Buffer.from(result.buffer), {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(result.fileName)}"`,
          'Cache-Control': 'no-cache',
        },
      });
    }

    // ipqc
    let query = adminClient
      .from('ipqc_records')
      .select('*')
      .order('inspection_date', { ascending: false });

    if (dateFrom) query = query.gte('inspection_date', dateFrom);
    if (dateTo) query = query.lte('inspection_date', dateTo);
    if (businessType) query = query.eq('business_type', businessType);

    const { data: records, error } = await query;
    if (error) {
      return NextResponse.json(
        { error: 'Failed to export IPQC data' },
        { status: 500 },
      );
    }
    data = (records as Record<string, unknown>[]) || [];

    const result = exportIPQCExcel(data, exportFilters, lang);

    return new NextResponse(Buffer.from(result.buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(result.fileName)}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Export error: ${msg}` }, { status: 500 });
  }
}
