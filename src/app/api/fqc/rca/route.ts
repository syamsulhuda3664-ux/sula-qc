import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';
import { generateWeeklyRCA } from '@/lib/rca-generator';
import { mapInspectionRow } from '@/lib/db-schema';

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, 'view');
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    let query = adminClient
      .from('rca_weekly')
      .select(`
        *,
        rca_actions (*)
      `)
      .order('week_start', { ascending: false });

    if (dateFrom) query = query.gte('week_start', dateFrom);
    if (dateTo) query = query.lte('week_start', dateTo);

    const { data, error } = await query;

    if (error) {
      console.error('List RCA error:', error);
      return NextResponse.json({ error: 'Failed to fetch RCA records' }, { status: 500 });
    }

    return NextResponse.json({ records: data || [] });
  } catch (error) {
    console.error('List RCA error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, 'full');
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { weekStart, weekEnd } = body;

    if (!weekStart || !weekEnd) {
      return NextResponse.json(
        { error: 'weekStart and weekEnd are required' },
        { status: 400 }
      );
    }

    // Fetch FQC records for the week
    const { data: fqcRecords, error: fqcError } = await adminClient
      .from('fqc_inspections')
      .select('*')
      .gte('inspection_date', weekStart)
      .lte('inspection_date', weekEnd);

    if (fqcError) {
      console.error('Fetch FQC for RCA error:', fqcError);
      return NextResponse.json({ error: 'Failed to fetch inspection data' }, { status: 500 });
    }

    // Check if RCA already exists for this week
    const { data: existing } = await adminClient
      .from('rca_weekly')
      .select('id')
      .eq('week_start', weekStart)
      .eq('week_end', weekEnd)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'RCA already exists for this week', existing_id: existing.id },
        { status: 409 }
      );
    }

    const rca = generateWeeklyRCA(
      new Date(weekStart),
      new Date(weekEnd),
      (fqcRecords || []).map(mapInspectionRow)
    );

    // Insert RCA record
    const { data: insertedRCA, error: rcaError } = await adminClient
      .from('rca_weekly')
      .insert({
        week_start: weekStart,
        week_end: weekEnd,
        total_inspections: rca.totalInspections,
        total_inspected: rca.totalInspected,
        total_ok: rca.totalOK,
        total_ng: rca.totalNG,
        overall_pass_rate: rca.overallPassRate,
        top_categories: rca.topCategories,
        top_sub_defects: rca.subDefects,
        top_styles: rca.topStyles,
        created_by: auth.user!.id,
      })
      .select('id, week_start, week_end')
      .single();

    if (rcaError || !insertedRCA) {
      console.error('Insert RCA error:', rcaError);
      return NextResponse.json({ error: 'Failed to create RCA record' }, { status: 500 });
    }

    return NextResponse.json(
      { rca: insertedRCA, message: 'Weekly RCA generated successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Generate RCA error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
