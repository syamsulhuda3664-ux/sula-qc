import { NextResponse } from 'next/server';
import { createLogoutCookie } from '@/lib/auth';

export async function POST() {
  try {
    const cookie = createLogoutCookie();
    return NextResponse.json(
      { message: 'Logged out successfully' },
      {
        headers: {
          'Set-Cookie': `${cookie.name}=${cookie.value}; HttpOnly; ${process.env.NODE_ENV === 'production' ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=0`,
        },
      }
    );
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
