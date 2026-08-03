import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest, getRoleLanguage, mapDbUser } from '@/lib/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, 'full');
  if (auth.error) return auth.error;

  if (auth.user!.role !== 'staff_qa') {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { display_name, role, password } = body;

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (display_name !== undefined) {
      updateData.full_name = display_name; // DB uses full_name column
    }

    if (role !== undefined) {
      const validRoles = ['staff_qa', 'manager_qc', 'manager_umum', 'spv_qc'];
      if (!validRoles.includes(role)) {
        return NextResponse.json(
          { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
          { status: 400 }
        );
      }
      updateData.role = role;
    }

    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password_hash = await bcrypt.hash(password, salt);
    }

    if (Object.keys(updateData).length <= 1) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: user, error } = await adminClient
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !user) {
      console.error('Update user error:', error);
      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }

    const mapped = mapDbUser(user);
    return NextResponse.json({
      user: { id: mapped.id, username: mapped.username, display_name: mapped.display_name, role: mapped.role, is_active: mapped.is_active, created_at: user.created_at, updated_at: user.updated_at, language: getRoleLanguage(user.role) },
      message: 'User updated successfully',
    });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, 'full');
  if (auth.error) return auth.error;

  if (auth.user!.role !== 'staff_qa') {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    const { id } = await params;

    if (id === auth.user!.id) {
      return NextResponse.json(
        { error: 'Cannot deactivate your own account' },
        { status: 400 }
      );
    }

    const { data: user, error } = await adminClient
      .from('users')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !user) {
      console.error('Deactivate user error:', error);
      return NextResponse.json({ error: 'Failed to deactivate user' }, { status: 500 });
    }

    const mapped = mapDbUser(user);
    return NextResponse.json({
      user: { id: mapped.id, username: mapped.username, display_name: mapped.display_name, role: mapped.role, is_active: mapped.is_active },
      message: 'User deactivated successfully',
    });
  } catch (error) {
    console.error('Deactivate user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
