import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';

/**
 * GET — return available style_codes and order_nos from fqc_inspections
 * for a given date + business_type. Used by Hot Issue form.
 *
 * Query params: date (required), business_type (optional)
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, 'view');
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const bt = searchParams.get('business_type');
  const styleCode = searchParams.get('style_code');

  if (!date) {
    return NextResponse.json({ error: 'date is required' }, { status: 400 });
  }

  try {
    // Build base query
    let styleQuery = adminClient
      .from('fqc_inspections')
      .select('style_code, order_no')
      .eq('inspection_date', date);
    if (bt && bt !== 'ALL') styleQuery = styleQuery.eq('business_type', bt);

    const { data: rows, error } = await styleQuery;
    if (error) {
      console.error('Daily options error:', error);
      return NextResponse.json({ error: 'Failed to fetch daily options' }, { status: 500 });
    }

    // Extract unique styles
    const styleSet = new Set<string>();
    const styleOrders: Record<string, string[]> = {};
    for (const r of rows || []) {
      const s = (r.style_code || '').trim();
      const o = (r.order_no || '').trim();
      if (s) {
        styleSet.add(s);
        if (!styleOrders[s]) styleOrders[s] = [];
        if (o && !styleOrders[s].includes(o)) styleOrders[s].push(o);
      }
    }

    const styles = [...styleSet].sort();

    // If a specific style is requested, return its order numbers
    if (styleCode) {
      return NextResponse.json({
        styles,
        order_nos: styleOrders[styleCode] || [],
      });
    }

    return NextResponse.json({ styles, order_nos: [] });
  } catch (error) {
    console.error('Daily options error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
