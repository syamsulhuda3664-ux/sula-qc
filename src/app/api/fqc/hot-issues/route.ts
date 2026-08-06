import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';

// ═══════════════════════════════════════════════════════════
// GET — list hot issues (all authenticated users can view)
// ═══════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, 'view');
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const bt = searchParams.get('business_type');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    let query = adminClient
      .from('rca_hot_issues')
      .select('*')
      .order('issue_date', { ascending: false });

    if (month) {
      const [yearStr, monthStr] = month.split('-');
      const year = parseInt(yearStr, 10);
      const m = parseInt(monthStr, 10);
      const firstDay = `${year}-${String(m).padStart(2, '0')}-01`;
      const lastDay = `${year}-${String(m).padStart(2, '0')}-${String(new Date(year, m, 0).getDate()).padStart(2, '0')}`;
      query = query.gte('issue_date', firstDay).lte('issue_date', lastDay);
    }

    if (dateFrom) query = query.gte('issue_date', dateFrom);
    if (dateTo) query = query.lte('issue_date', dateTo);
    if (bt && bt !== 'ALL') query = query.eq('business_type', bt);

    const { data, error } = await query;

    if (error) {
      console.error('List hot issues error:', error);
      return NextResponse.json({ error: 'Failed to fetch hot issues' }, { status: 500 });
    }

    return NextResponse.json({ records: data || [] });
  } catch (error) {
    console.error('List hot issues error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════
// POST — create hot issue (staff_qa, manager_qc only)
// ═══════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, 'view');
  if (auth.error) return auth.error;

  const role = auth.user?.role;
  if (role !== 'staff_qa' && role !== 'manager_qc') {
    return NextResponse.json({ error: 'Only staff QA and quality manager can create hot issues' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { issue_date, business_type, category, sub_defect, defect_qty, style_codes,
      root_cause, impact, process, corrective_action, preventive_action,
      responsible, due_date, photo_before, photo_after } = body;

    if (!issue_date || !business_type || !sub_defect) {
      return NextResponse.json({ error: 'issue_date, business_type, and sub_defect are required' }, { status: 400 });
    }

    const { data, error } = await adminClient
      .from('rca_hot_issues')
      .insert({
        issue_date,
        business_type,
        category: category || null,
        sub_defect,
        defect_qty: defect_qty || 0,
        style_codes: style_codes || [],
        root_cause: root_cause || null,
        impact: impact || null,
        process: process || null,
        corrective_action: corrective_action || null,
        preventive_action: preventive_action || null,
        responsible: responsible || null,
        due_date: due_date || null,
        photo_before: photo_before || null,
        photo_after: photo_after || null,
        created_by: auth.user!.id,
      })
      .select('*')
      .single();

    if (error) {
      console.error('Create hot issue error:', error);
      return NextResponse.json({ error: 'Failed to create hot issue' }, { status: 500 });
    }

    return NextResponse.json({ record: data, message: 'Hot issue created' });
  } catch (error) {
    console.error('Create hot issue error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
