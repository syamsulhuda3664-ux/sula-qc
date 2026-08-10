import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';

// ═══════════════════════════════════════════════════════════
// PUT — update hot issue (staff_qa, manager_qc only)
// Note: Hot Issue data is independent — does NOT modify fqc_inspections.
// ═══════════════════════════════════════════════════════════
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, 'view');
  if (auth.error) return auth.error;
  const role = auth.user?.role;
  if (role !== 'staff_qa' && role !== 'manager_qc') {
    return NextResponse.json({ error: 'Only staff QA and quality manager can update hot issues' }, { status: 403 });
  }
  try {
    const { id } = await params;
    const body = await request.json();
    const now = new Date().toISOString();

    // Fetch existing record
    const { data: existing } = await adminClient
      .from('rca_hot_issues').select('*').eq('id', id).single();
    if (!existing) {
      return NextResponse.json({ error: 'Hot issue not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updated_at: now };
    const allowed = ['issue_date', 'business_type', 'category', 'sub_defect', 'defect_qty',
      'style_codes', 'order_no', 'root_cause', 'root_cause_zh', 'impact', 'impact_zh',
      'process', 'process_zh', 'corrective_action', 'corrective_action_zh',
      'preventive_action', 'preventive_action_zh', 'responsible', 'responsible_zh',
      'due_date', 'status', 'photo_before', 'photo_after'];
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    const { data, error } = await adminClient
      .from('rca_hot_issues')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      console.error('Update hot issue error:', error);
      return NextResponse.json({ error: 'Failed to update hot issue' }, { status: 500 });
    }

    return NextResponse.json({ record: data, message: 'Hot issue updated' });
  } catch (error) {
    console.error('Update hot issue error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════
// DELETE — delete hot issue (staff_qa, manager_qc only)
// Note: Hot Issue data is independent — does NOT modify fqc_inspections.
// ═══════════════════════════════════════════════════════════
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, 'view');
  if (auth.error) return auth.error;
  const role = auth.user?.role;
  if (role !== 'staff_qa' && role !== 'manager_qc') {
    return NextResponse.json({ error: 'Only staff QA and quality manager can delete hot issues' }, { status: 403 });
  }
  try {
    const { id } = await params;
    const { data: existing } = await adminClient
      .from('rca_hot_issues').select('*').eq('id', id).single();
    if (!existing) {
      return NextResponse.json({ error: 'Hot issue not found' }, { status: 404 });
    }
    const { error } = await adminClient
      .from('rca_hot_issues')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Delete hot issue error:', error);
      return NextResponse.json({ error: 'Failed to delete hot issue' }, { status: 500 });
    }
    return NextResponse.json({ message: 'Hot issue deleted' });
  } catch (error) {
    console.error('Delete hot issue error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
