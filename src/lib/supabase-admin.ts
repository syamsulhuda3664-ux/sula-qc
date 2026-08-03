import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Direct REST fetch to Supabase using service_role key.
 * Fallback when @supabase/supabase-js client fails (e.g. wrong/rotated key).
 */
export async function sbFetch(
  table: string,
  options: {
    select?: string;
    eq?: [string, string | boolean | number];
    single?: boolean;
    order?: [string, { ascending: boolean }];
    insert?: Record<string, unknown>;
    update?: Record<string, unknown>;
    limit?: number;
  } = {}
): Promise<{ data: Record<string, unknown> | Record<string, unknown>[] | null; error: string | null }> {
  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  const params = new URLSearchParams();

  if (options.select) params.set('select', options.select);
  if (options.eq) params.set(options.eq[0], String(options.eq[1]));
  if (options.single) params.set('single', 'true');
  if (options.order) {
    params.set('order', `${options.order[0]}.${options.order[1].ascending ? 'asc' : 'desc'}`);
  }
  if (options.limit) params.set('limit', String(options.limit));

  url.search = params.toString();

  const headers: Record<string, string> = {
    'apikey': supabaseServiceRoleKey,
    'Authorization': `Bearer ${supabaseServiceRoleKey}`,
    'Content-Type': 'application/json',
    'Prefer': options.single ? 'return=representation' : 'return=representation',
  };

  try {
    let response: Response;
    if (options.insert) {
      response = await fetch(url.toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify(options.insert),
      });
    } else if (options.update) {
      response = await fetch(url.toString(), {
        method: 'PATCH',
        headers,
        body: JSON.stringify(options.update),
      });
    } else {
      response = await fetch(url.toString(), { headers });
    }

    const text = await response.text();
    if (!response.ok) {
      try {
        const err = JSON.parse(text);
        return { data: null, error: err.message || err.code || `HTTP ${response.status}` };
      } catch {
        return { data: null, error: `HTTP ${response.status}: ${text.substring(0, 200)}` };
      }
    }

    try {
      const data = JSON.parse(text);
      return { data: options.single ? (Array.isArray(data) ? data[0] : data) : data, error: null };
    } catch {
      return { data: null, error: 'Invalid JSON response' };
    }
  } catch (e) {
    return { data: null, error: String(e) };
  }
}
