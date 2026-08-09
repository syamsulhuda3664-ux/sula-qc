import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';

const BUCKET_NAME = 'rca-photos';

// ONE-TIME CLEANUP — no auth required.
// This file should be deleted after use.
export async function GET() {
  try {
    // 1. List all files in the bucket
    const { data: allFiles, error: listError } = await adminClient.storage
      .from(BUCKET_NAME)
      .list('', { recursive: true });

    if (listError) {
      return NextResponse.json({ error: 'Failed to list: ' + String(listError) }, { status: 500 });
    }

    if (!allFiles || allFiles.length === 0) {
      return NextResponse.json({ message: 'No files in storage', deleted: 0, total: 0 });
    }

    // Log all files for visibility
    const fileList = allFiles.map(f => ({ name: f.name, size: f.metadata?.size }));

    // 2. Collect all used photo URLs from database
    const usedPaths = new Set<string>();

    // From rca_actions
    const { data: rcaActions } = await adminClient
      .from('rca_actions')
      .select('photo_before, photo_after');
    if (rcaActions) {
      for (const a of rcaActions) {
        for (const field of ['photo_before', 'photo_after'] as const) {
          const url = a[field];
          if (!url) continue;
          try {
            const urlObj = new URL(url);
            const segments = urlObj.pathname.split('/');
            const publicIdx = segments.indexOf('public');
            if (publicIdx !== -1) {
              usedPaths.add(segments.slice(publicIdx + 2).join('/'));
            }
          } catch {
            usedPaths.add(url);
          }
        }
      }
    }

    // From rca_hot_issues
    const { data: hotIssues } = await adminClient
      .from('rca_hot_issues')
      .select('photo_before, photo_after');
    if (hotIssues) {
      for (const h of hotIssues) {
        for (const field of ['photo_before', 'photo_after'] as const) {
          const url = h[field];
          if (!url) continue;
          try {
            const urlObj = new URL(url);
            const segments = urlObj.pathname.split('/');
            const publicIdx = segments.indexOf('public');
            if (publicIdx !== -1) {
              usedPaths.add(segments.slice(publicIdx + 2).join('/'));
            }
          } catch {
            usedPaths.add(url);
          }
        }
      }
    }

    // 3. Find orphaned files
    const orphanedPaths: string[] = [];
    for (const file of allFiles) {
      if (!file.name) continue;
      if (!usedPaths.has(file.name)) {
        orphanedPaths.push(file.name);
      }
    }

    // 4. Delete orphaned files (batch of 100)
    let deletedCount = 0;
    const errors: string[] = [];
    for (let i = 0; i < orphanedPaths.length; i += 100) {
      const batch = orphanedPaths.slice(i, i + 100);
      const { error: delError } = await adminClient.storage
        .from(BUCKET_NAME)
        .remove(batch);
      if (delError) {
        errors.push(String(delError));
      } else {
        deletedCount += batch.length;
      }
    }

    return NextResponse.json({
      message: 'Cleanup complete',
      total_files: allFiles.length,
      used_files: allFiles.length - orphanedPaths.length,
      used_paths: Array.from(usedPaths),
      orphaned_files: orphanedPaths.length,
      orphaned_list: orphanedPaths,
      deleted: deletedCount,
      all_files: fileList,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error: ' + String(error) }, { status: 500 });
  }
}
