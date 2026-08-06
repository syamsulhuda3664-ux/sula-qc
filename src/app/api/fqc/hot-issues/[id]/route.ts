import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';
import { SUBDEFECT_NAMES } from '@/lib/rca-generator';
import { SUBDEFECT_DB_COLUMNS } from '@/lib/db-schema';

/** Re-export sync function for use in PUT/DELETE */
async function syncDefectToFqcInspection(
  issueDate: string,
  businessType: string,
  styleCode: string,
  orderNo: string | null,
  subDefect: string,
  categoryKey: string,
  delta: number
) {
  if (!subDefect || delta === 0 || !styleCode || !categoryKey) return;
  const subIdx = SUBDEFECT_NAMES.indexOf(subDefect);
  const subCol = subIdx >= 0 ? SUBDEFECT_DB_COLUMNS[subIdx] : null;
  if (!subCol) return;
  let query = adminClient
    .from('fqc_inspections')
    .select('id, ng_qty')
    .eq('inspection_date', issueDate)
    .eq('business_type', businessType)
    .eq('style_code', styleCode);
  if (orderNo) query = query.eq('order_no', orderNo);
  const { data: rows, error: fetchErr } = await query;
  if (fetchErr || !rows || rows.length === 0) return;
  for (const row of rows) {
    const updates: Record<string, unknown> = {
      [subCol]: (Number((row as any)[subCol]) || 0) + delta,
      [categoryKey]: (Number((row as any)[categoryKey]) || 0) + delta,
      ng_qty: (Number(row.ng_qty) || 0) + delta,
    };
    const { error: updateErr } = await adminClient
      .from('fqc_inspections')
      .update(updates)
      .eq('id', row.id);
    if (updateErr) {
      console.error(`[Hot Issue Sync] Failed to update inspection ${row.id}:`, updateErr.message);
    } else {
      console.log(`[Hot Issue Sync] Updated inspection ${row.id}: ${subCol} += ${delta}, ${categoryKey} += ${delta}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// PUT — update hot issue (staff_qa, manager_qc only)
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

    // Fetch existing record to compute delta
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

    // Sync delta to fqc_inspections (if defect_qty, style, sub_defect, or category changed)
    const oldQty = Number(existing.defect_qty) || 0;
    const newQty = Number(data.defect_qty) || 0;
    const delta = newQty - oldQty;
    if (delta !== 0 && data.sub_defect && data.category) {
      const oldStyle = (existing.style_codes || [])[0];
      const newStyle = (data.style_codes || [])[0];
      const oldOrderNo = existing.order_no;
      const newOrderNo = data.order_no;
      // If style/order changed, revert old and apply new
      if (oldStyle && oldStyle !== newStyle) {
        await syncDefectToFqcInspection(
          existing.issue_date, existing.business_type, oldStyle, oldOrderNo,
          existing.sub_defect, existing.category, -oldQty
        );
      }
      if (newStyle) {
        await syncDefectToFqcInspection(
          data.issue_date, data.business_type, newStyle, newOrderNo,
          data.sub_defect, data.category, delta
        );
      }
    }

    return NextResponse.json({ record: data, message: 'Hot issue updated' });
  } catch (error) {
    console.error('Update hot issue error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════
// DELETE — delete hot issue (staff_qa, manager_qc only)
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
    // Fetch existing to revert sync
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
    // Revert sync: subtract defect qty from fqc_inspections
    const styleCode = (existing.style_codes || [])[0];
    if (styleCode && existing.sub_defect && existing.category && (existing.defect_qty || 0) > 0) {
      await syncDefectToFqcInspection(
        existing.issue_date, existing.business_type, styleCode, existing.order_no,
        existing.sub_defect, existing.category, -(existing.defect_qty || 0)
      );
    }
    return NextResponse.json({ message: 'Hot issue deleted' });
  } catch (error) {
    console.error('Delete hot issue error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
