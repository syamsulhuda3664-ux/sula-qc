import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { adminClient } from '@/lib/supabase-admin';

const MANAGEABLE_TABLES = [
  { key: 'fqc_daily_uploads', label: 'FQC Daily Uploads', labelZh: 'FQC 日报上传', icon: 'upload', protect: false },
  { key: 'fqc_inspections', label: 'FQC Inspections', labelZh: 'FQC 检验记录', icon: 'clipboard-check', protect: false },
  { key: 'ipqc_records', label: 'IPQC Records', labelZh: 'IPQC 记录', icon: 'activity', protect: false },
  { key: 'oqc_daily_lots', label: 'OQC Daily Lots', labelZh: 'OQC 每日批次', icon: 'package', protect: false },
  { key: 'oqc_lot_orders', label: 'OQC Lot Orders', labelZh: 'OQC 批次订单', icon: 'package-open', protect: false },
  { key: 'oqc_defects', label: 'OQC Defects', labelZh: 'OQC 缺陷', icon: 'alert-triangle', protect: false },
  { key: 'rca_weekly', label: 'RCA Weekly', labelZh: 'RCA 周报', icon: 'search', protect: false },
  { key: 'rca_actions', label: 'RCA Actions', labelZh: 'RCA 行动项', icon: 'check-square', protect: false },
  { key: 'rca_hot_issues', label: 'Hot Issues', labelZh: 'Hot Issue 热点问题', icon: 'flame', protect: false },
  { key: 'users', label: 'Users', labelZh: '用户', icon: 'users', protect: true },
];

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, 'full');
  if (auth.error) return auth.error;

  if (auth.user!.role !== 'staff_qa') {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    const stats = await Promise.all(
      MANAGEABLE_TABLES.map(async (table) => {
        try {
          const { count, error } = await adminClient
            .from(table.key)
            .select('*', { count: 'exact', head: true });

          if (error) {
            return { ...table, count: -1, error: error.message };
          }
          return { ...table, count: count ?? 0, error: null };
        } catch (e) {
          return { ...table, count: -1, error: String(e) };
        }
      })
    );

    return NextResponse.json({ tables: stats });
  } catch (error) {
    console.error('DB management stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch table stats' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request, 'full');
  if (auth.error) return auth.error;

  if (auth.user!.role !== 'staff_qa') {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { tables, resetAll } = body;

    if (resetAll) {
      // Reset all non-protected tables
      const deletableTables = MANAGEABLE_TABLES.filter(t => !t.protect);
      const results: Record<string, { deleted: boolean; error?: string }> = {};

      for (const table of deletableTables) {
        try {
          const { error } = await adminClient
            .from(table.key)
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all

          results[table.key] = error
            ? { deleted: false, error: error.message }
            : { deleted: true };
        } catch (e) {
          results[table.key] = { deleted: false, error: String(e) };
        }
      }

      return NextResponse.json({
        message: 'Reset all data completed',
        results,
      });
    }

    if (!tables || !Array.isArray(tables) || tables.length === 0) {
      return NextResponse.json(
        { error: 'Specify tables to delete' },
        { status: 400 }
      );
    }

    const results: Record<string, { deleted: boolean; error?: string }> = {};

    for (const tableKey of tables) {
      const tableDef = MANAGEABLE_TABLES.find(t => t.key === tableKey);

      if (!tableDef) {
        results[tableKey] = { deleted: false, error: 'Unknown table' };
        continue;
      }

      if (tableDef.protect) {
        results[tableKey] = { deleted: false, error: 'Protected table. Use User Management to manage users.' };
        continue;
      }

      try {
        const { error } = await adminClient
          .from(tableKey)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');

        results[tableKey] = error
          ? { deleted: false, error: error.message }
          : { deleted: true };
      } catch (e) {
        results[tableKey] = { deleted: false, error: String(e) };
      }
    }

    return NextResponse.json({
      message: 'Delete completed',
      results,
    });
  } catch (error) {
    console.error('DB management delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request, 'full');
  if (auth.error) return auth.error;

  if (auth.user!.role !== 'staff_qa') {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { table, dateFrom, dateTo } = body;

    if (!table) {
      return NextResponse.json({ error: 'Table is required' }, { status: 400 });
    }

    const tableDef = MANAGEABLE_TABLES.find(t => t.key === table);
    if (!tableDef) {
      return NextResponse.json({ error: 'Unknown table' }, { status: 400 });
    }
    if (tableDef.protect) {
      return NextResponse.json({ error: 'Cannot delete from protected table' }, { status: 400 });
    }

    // Determine date column based on table
    const dateColumn = table === 'fqc_daily_uploads' ? 'upload_date'
      : table === 'fqc_inspections' ? 'inspection_date'
      : table === 'ipqc_records' ? 'record_date'
      : table === 'oqc_daily_lots' ? 'lot_date'
      : table === 'rca_weekly' ? 'week_start'
      : 'created_at';

    let query = adminClient
      .from(table)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (dateFrom) {
      query = query.gte(dateColumn, dateFrom);
    }
    if (dateTo) {
      query = query.lte(dateColumn, dateTo);
    }

    // If no date filters, require confirmation via resetAll in DELETE
    if (!dateFrom && !dateTo) {
      return NextResponse.json(
        { error: 'Use DELETE with tables array or resetAll for full table clear' },
        { status: 400 }
      );
    }

    const { error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      message: `Deleted records from ${tableDef.label}${dateFrom ? ` from ${dateFrom}` : ''}${dateTo ? ` to ${dateTo}` : ''}`,
    });
  } catch (error) {
    console.error('DB management patch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
