import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, 'view');
  if (auth.error) return auth.error;

  // Only staff_qa, manager_qc, and manager_umum can edit RCA actions
  const role = auth.user?.role;
  if (role !== 'staff_qa' && role !== 'manager_qc' && role !== 'manager_umum') {
    return NextResponse.json({ error: 'Insufficient access rights to edit RCA' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { actions, status: rcaStatus } = body;

    const { data: rca } = await adminClient
      .from('rca_weekly')
      .select('id')
      .eq('id', id)
      .single();

    if (!rca) {
      return NextResponse.json({ error: 'RCA record not found' }, { status: 404 });
    }

    const userId = auth.user!.id;
    const now = new Date().toISOString();
    const results: Record<string, unknown>[] = [];

    if (Array.isArray(actions)) {
      for (const action of actions) {
        const { rank, category, sub_defects, defect_qty, style_codes, root_cause, impact, process, corrective_action, preventive_action, responsible, due_date, status: actionStatus, photo_before, photo_after } = action;

        if (!rank) continue;

        const row: Record<string, unknown> = {
          rca_id: id,
          rank,
          category: category || null,
          sub_defects: sub_defects || [],
          defect_qty: defect_qty || 0,
          style_codes: style_codes || [],
          root_cause: root_cause || null,
          impact: impact || null,
          process: process || null,
          corrective_action: corrective_action || null,
          preventive_action: preventive_action || null,
          responsible: responsible || null,
          due_date: due_date || null,
          status: actionStatus || 'pending',
          photo_before: photo_before || null,
          photo_after: photo_after || null,
          updated_by: userId,
          updated_at: now,
        };

        const { data: existing } = await adminClient
          .from('rca_actions')
          .select('id')
          .eq('rca_id', id)
          .eq('rank', rank)
          .maybeSingle();

        let result;
        if (existing) {
          const { data, error } = await adminClient
            .from('rca_actions')
            .update(row)
            .eq('id', existing.id)
            .select('*')
            .single();
          if (error) console.error('Update action error:', error);
          result = data;
        } else {
          const { data, error } = await adminClient
            .from('rca_actions')
            .insert({ ...row, created_by: userId })
            .select('*')
            .single();
          if (error) console.error('Insert action error:', error);
          result = data;
        }
        if (result) results.push(result);
      }
    }

    // Auto-update RCA status
    if (actions?.length > 0) {
      const allCompleted = actions.every((a: { status?: string }) => a.status === 'completed');
      await adminClient
        .from('rca_weekly')
        .update({ status: allCompleted ? 'completed' : 'in_progress' })
        .eq('id', id);
    } else if (rcaStatus && ['pending', 'in_progress', 'completed'].includes(rcaStatus)) {
      await adminClient
        .from('rca_weekly')
        .update({ status: rcaStatus })
        .eq('id', id);
    }

    return NextResponse.json({
      actions: results,
      message: `${results.length} action(s) saved successfully`,
    });
  } catch (error) {
    console.error('Save RCA actions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
