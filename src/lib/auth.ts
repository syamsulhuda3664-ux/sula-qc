import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { adminClient } from './supabase';
export { getRoleLanguage } from './i18n';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'sula-qc-secret-key-change-in-production-2026'
);

const COOKIE_NAME = 'sula_qc_session';

export interface AuthUser {
  id: string;
  username: string;
  display_name: string;
  role: string;
  is_active: boolean;
}

/** Map DB columns (full_name, active) to app fields (display_name, is_active) */
export function mapDbUser(row: Record<string, unknown>): AuthUser {
  return {
    id: row.id as string,
    username: row.username as string,
    display_name: (row.display_name ?? row.full_name) as string,
    role: row.role as string,
    is_active: row.is_active !== undefined ? (row.is_active as boolean) : (row.active as boolean),
  };
}

export type AccessLevel = 'full' | 'view' | 'any';

const ROLE_ACCESS: Record<string, AccessLevel> = {
  staff_qa: 'full',
  manager_qc: 'full',
  manager_umum: 'view',
  spv_qc: 'view',
};

function getRoleAccess(role: string): AccessLevel {
  return ROLE_ACCESS[role] || 'view';
}

export function hasFullAccess(role: string): boolean {
  return getRoleAccess(role) === 'full';
}

export function hasAccess(role: string, method: string, required?: AccessLevel): boolean {
  if (required === 'any') return true;
  const access = getRoleAccess(role);
  if (access === 'full') return true;
  if (required === 'view') return true;
  if (required === 'full' && method === 'GET' && access === 'view') return true;
  return false;
}

export async function signToken(user: AuthUser): Promise<string> {
  const token = await new SignJWT({
    id: user.id,
    username: user.username,
    role: user.role,
    display_name: user.display_name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(JWT_SECRET);
  return token;
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      id: payload.id as string,
      username: payload.username as string,
      display_name: payload.display_name as string,
      role: payload.role as string,
      is_active: true,
    };
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function createSessionCookie(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  };
}

export function createLogoutCookie() {
  return {
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  };
}

export interface AuthResult {
  user: AuthUser | null;
  error: Response | null;
}

export async function authenticateRequest(
  request: NextRequest,
  required: AccessLevel = 'any'
): Promise<AuthResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return {
      user: null,
      error: new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }

  const user = await verifyToken(token);
  if (!user) {
    return {
      user: null,
      error: new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }

  // Verify user is still active in DB
  const { data: dbUser } = await adminClient
    .from('users')
    .select('id, is_active, active')
    .eq('id', user.id)
    .single();

  if (!dbUser) {
    return {
      user: null,
      error: new Response(JSON.stringify({ error: 'User account is inactive' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }

  const isActive = dbUser.is_active !== undefined ? dbUser.is_active : dbUser.active;
  if (!isActive) {
    return {
      user: null,
      error: new Response(JSON.stringify({ error: 'User account is inactive' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }

  const method = request.method;
  if (!hasAccess(user.role, method, required)) {
    return {
      user: null,
      error: new Response(JSON.stringify({ error: 'Insufficient access rights' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }

  return { user, error: null };
}

export { COOKIE_NAME, ROLE_ACCESS };
