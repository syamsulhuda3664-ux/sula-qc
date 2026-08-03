import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { adminClient } from '@/lib/supabase';
import { signToken, createSessionCookie, getRoleLanguage, mapDbUser } from '@/lib/auth';

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

    const { data: row, error: dbError } = await adminClient
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (dbError || !row) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    // Support both column naming conventions
    const isActive = row.is_active !== undefined ? row.is_active : row.active;
    if (!isActive) {
      return NextResponse.json(
        { error: 'Account is deactivated. Contact administrator.' },
        { status: 403 }
      );
    }

    const isValidPassword = await bcrypt.compare(password, row.password_hash);
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
