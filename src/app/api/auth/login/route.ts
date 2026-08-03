import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { signToken, createSessionCookie, getRoleLanguage, mapDbUser } from '@/lib/auth';
import { adminClient, sbFetch } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    // Try Supabase client first, fallback to direct REST
    let row: Record<string, unknown> | null = null;

    try {
      const { data, error } = await adminClient
        .from('users')
        .select('*')
        .eq('username', username)
        .single();
      if (!error && data) row = data as Record<string, unknown>;
    } catch {
      // client failed, try direct REST
    }

    if (!row) {
      const result = await sbFetch('users', {
        select: '*',
        eq: ['username', username],
        single: true,
      });
      if (result.error || !result.data) {
        return NextResponse.json(
          { error: 'Invalid username or password' },
          { status: 401 }
        );
      }
      row = result.data as Record<string, unknown>;
    }

    // Support both column naming conventions
    const isActive = row.is_active !== undefined ? (row.is_active as boolean) : (row.active as boolean);
    if (!isActive) {
      return NextResponse.json(
        { error: 'Account is deactivated. Contact administrator.' },
        { status: 403 }
      );
    }

    const isValidPassword = await bcrypt.compare(password, row.password_hash as string);
    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    const user = mapDbUser(row);

    const token = await signToken({
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      is_active: user.is_active,
    });

    const sessionCookie = createSessionCookie(token);

    return NextResponse.json(
      {
        user: {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          role: user.role,
          language: getRoleLanguage(user.role),
        },
        message: 'Login successful',
      },
      {
        headers: {
          'Set-Cookie': `${sessionCookie.name}=${sessionCookie.value}; HttpOnly; ${process.env.NODE_ENV === 'production' ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=${sessionCookie.maxAge}`,
        },
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
