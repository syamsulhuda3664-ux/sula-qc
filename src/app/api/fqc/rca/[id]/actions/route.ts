import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';

/**
 * GET: Fetch all actions for an RCA
 * PUT: Save actions array (upsert by rank)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, 'view');
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const { data, error } = await adminClient
      .from('rca_actions')
      .select('*')
      .eq('rca_id', id)
      .order('rank', { ascending: true });

    if (error) {
      console.error('Fetch RCA actions error:', error);
      return NextResponse.json({ error: 'Failed to fetch actions' }, { status: 500 });
    }

    return NextResponse.json({ actions: data || [] });
  } catch (error) {
    console.error('Fetch RCA actions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, 'full');
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const body = await request.json();
    const { actions, status: rcaStatus } = body;

    // Verify the RCA exists
    const { data: rca, error: rcaError } = await adminClient
      .from('rca_weekly')
      .select('id')
      .eq('id', id)
      .single();

    if (rcaError || !rca) {
      return NextResponse.json({ error: 'RCA record not found' }, { status: 404 });
    }

    const userId = auth.user!.id;
    const now = new Date().toISOString();
    const results: Record<string, unknown>[] = [];

    if (Array.isArray(actions)) {
      // Upsert each action by (rca_id, rank)
      for (const action of actions) {
        const { rank, category, sub_defects, defect_qty, style_codes, root_cause, impact, process, corrective_action, preventive_action, responsible, due_date, status: actionStatus } = action;

        if (!rank) continue;

        const row = {
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
          updated_by: userId,
          updated_at: now,
        };

        // Check if action exists for this rca_id + rank
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

    // Optionally update RCA status
    if (rcaStatus && ['pending', 'in_progress', 'completed'].includes(rcaStatus)) {
      await adminClient
        .from('rca_weekly')
        .update({ status: rcaStatus })
        .eq('id', id);
    } else if (actions?.length > 0) {
      // Auto-set to in_progress if actions are being saved
      const allCompleted = actions.every((a: { status?: string }) => a.status === 'completed');
      if (allCompleted) {
        await adminClient
          .from('rca_weekly')
          .update({ status: 'completed' })
          .eq('id', id);
      } else {
        await adminClient
          .from('rca_weekly')
          .update({ status: 'in_progress' })
          .eq('id', id);
      }
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
