import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { authenticateRequest } from '@/lib/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, 'full');
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const body = await request.json();
    const { root_cause, corrective_action, preventive_action, responsible, due_date, status } = body;

    if (!root_cause && !corrective_action && !preventive_action && !responsible && !due_date && !status) {
      return NextResponse.json(
        { error: 'At least one field to update is required' },
        { status: 400 }
      );
    }

    // Verify the RCA exists
    const { data: rca, error: rcaError } = await adminClient
      .from('rca_weekly')
      .select('id')
      .eq('id', id)
      .single();

    if (rcaError || !rca) {
      return NextResponse.json({ error: 'RCA record not found' }, { status: 404 });
    }

    // Check if action already exists for this RCA
    const { data: existing } = await adminClient
      .from('rca_actions')
      .select('id')
      .eq('rca_id', id)
      .single();

    const updateData: Record<string, unknown> = {
      updated_by: auth.user!.id,
      updated_at: new Date().toISOString(),
    };

    if (root_cause !== undefined) updateData.root_cause = root_cause;
    if (corrective_action !== undefined) updateData.corrective_action = corrective_action;
    if (preventive_action !== undefined) updateData.preventive_action = preventive_action;
    if (responsible !== undefined) updateData.responsible = responsible;
    if (due_date !== undefined) updateData.due_date = due_date;
    if (status !== undefined) updateData.status = status;

    let result;
    if (existing) {
      const { data, error } = await adminClient
        .from('rca_actions')
        .update(updateData)
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) {
        console.error('Update RCA actions error:', error);
        return NextResponse.json({ error: 'Failed to update actions' }, { status: 500 });
      }
      result = data;
    } else {
      const { data, error } = await adminClient
        .from('rca_actions')
        .insert({
          rca_id: id,
          ...updateData,
          created_by: auth.user!.id,
        })
        .select('*')
        .single();
      if (error) {
        console.error('Insert RCA actions error:', error);
        return NextResponse.json({ error: 'Failed to create actions' }, { status: 500 });
      }
      result = data;
    }

    return NextResponse.json({ action: result, message: 'RCA actions updated successfully' });
  } catch (error) {
    console.error('Update RCA actions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
