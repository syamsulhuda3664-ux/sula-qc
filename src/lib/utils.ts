import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extract the line sort key from a production_line string.
 * Examples:
 *   "车缝一组(Sewing Line 1)"        → "01"
 *   "车缝三组 (Sewing Line 3A)"      → "03A"
 *   "车缝二十三组(Sewing Line 23)"   → "23"
 *   "Sewing Line 8B"                → "08B"
 *   "Unknown"                       → "99"
 */
export function extractLineSortKey(line: string): string {
  if (!line) return '99';
  // Match "Sewing Line" followed by optional space, then number, then optional letter
  const match = line.match(/Sewing\s+Line\s*(\d+)([A-Z])?/i);
  if (!match) return '99';
  const num = parseInt(match[1], 10);
  const suffix = (match[2] || '').toUpperCase();
  return String(num).padStart(2, '0') + suffix;
}

/**
 * Sort production lines in the factory's standard order:
 * 1, 2, 3A, 3B, 4, 5A, 5B, 6A, 6B, 7A, 7B, 8A, 8B, 9, 10, ..., 24
 */
export function sortProductionLines<T extends Record<string, any>>(
  records: T[],
  lineField: string = 'line'
): T[] {
  return [...records].sort((a, b) => {
    const keyA = extractLineSortKey(String(a[lineField] || ''));
    const keyB = extractLineSortKey(String(b[lineField] || ''));
    return keyA.localeCompare(keyB);
  });
}

/**
 * Get a unique sorted list of production lines from records.
 */
export function getSortedUniqueLines<T extends Record<string, any>>(
  records: T[],
  lineField: string = 'line'
): string[] {
  const lines = [...new Set(records.map((r) => String(r[lineField] || '')))];
  return lines.sort((a, b) => {
    const keyA = extractLineSortKey(a);
    const keyB = extractLineSortKey(b);
    return keyA.localeCompare(keyB);
  });
}
