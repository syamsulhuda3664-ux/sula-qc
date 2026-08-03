import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { adminClient } from '@/lib/supabase';
import { authenticateRequest, getRoleLanguage, mapDbUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, 'view');
  if (auth.error) return auth.error;

  // Only staff_qa can list users
  if (auth.user!.role !== 'staff_qa') {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const active = searchParams.get('active');

    let query = adminClient
      .from('users')
      .select('*')
      .order('created_at', { ascending: true });

    if (role) {
      query = query.eq('role', role);
    }
    if (active !== null && active !== undefined && active !== '') {
      // Support both column naming conventions
      query = query.eq('active', active === 'true');
    }

    const { data, error } = await query;

    if (error) {
      console.error('List users error:', error);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    const users = (data || []).map((u) => {
      const mapped = mapDbUser(u);
      return {
        id: u.id,
        username: u.username,
        display_name: mapped.display_name,
        role: u.role,
        is_active: mapped.is_active,
        created_at: u.created_at,
        updated_at: u.updated_at,
        language: getRoleLanguage(u.role),
      };
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('List users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, 'full');
  if (auth.error) return auth.error;

  if (auth.user!.role !== 'staff_qa') {
    return NextResponse.json({ error: 'Access denied. Only staff_qa can create users.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { username, password, display_name, role } = body;

    if (!username || !password || !display_name || !role) {
      return NextResponse.json(
        { error: 'username, password, display_name, and role are required' },
        { status: 400 }
      );
    }

    const validRoles = ['staff_qa', 'manager_qc', 'manager_umum', 'spv_qc'];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
        { status: 400 }
      );
    }

    // Check if username already exists
    const { data: existing } = await adminClient
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'Username already exists' },
        { status: 409 }
      );
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Use DB column names (full_name, active) for insert
    const { data: user, error } = await adminClient
      .from('users')
      .insert({
        username,
        password_hash: passwordHash,
        full_name: display_name,
        role,
        active: true,
      })
      .select('*')
      .single();

    if (error) {
      console.error('Create user error:', error);
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    const mapped = mapDbUser(user);
    return NextResponse.json(
      { user: { id: mapped.id, username: mapped.username, display_name: mapped.display_name, role: mapped.role, is_active: mapped.is_active, created_at: user.created_at, language: getRoleLanguage(user.role) }, message: 'User created successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
