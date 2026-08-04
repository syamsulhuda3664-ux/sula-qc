import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Chinese number mapping
const CN_NUMS: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
  '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
  '十六': 16, '十七': 17, '十八': 18, '十九': 19, '二十': 20,
  '二十一': 21, '二十二': 22, '二十三': 23, '二十四': 24, '二十五': 25,
  '二十六': 26, '二十七': 27, '二十八': 28, '二十九': 29,
};

/** Parse a Chinese number like 二十三 → 23 */
function parseCnNum(s: string): number | null {
  if (CN_NUMS[s] !== undefined) return CN_NUMS[s];
  return null;
}

/**
 * Extract the line sort key from a production_line string.
 * Handles multiple formats:
 *   "车缝一组(Sewing Line 1)"        → "01"
 *   "车缝三组 (Sewing Line 3A)"      → "03A"
 *   "车缝二十三组(Sewing Line 23)"   → "23"
 *   "Sewing Line 8B"                → "08B"
 *   "车缝一组"                      → "01"
 *   "车缝三组"                      → "03"
 *   "Line 5A"                       → "05A"
 *   "Unknown"                       → "99"
 */
export function extractLineSortKey(line: string): string {
  if (!line) return '99';

  // 1. Try English pattern: "Sewing Line 3A" or "Line 5B"
  const enMatch = line.match(/(?:Sewing\s+)?Line\s*(\d+)([A-Z])?/i);
  if (enMatch) {
    const num = parseInt(enMatch[1], 10);
    const suffix = (enMatch[2] || '').toUpperCase();
    return String(num).padStart(2, '0') + suffix;
  }

  // 2. Try Chinese pattern: "车缝X组" or "车缝X组(...)"  e.g. 车缝一组, 车缝二十三组
  const cnMatch = line.match(/车缝([一二三四五六七八九十]+)组/);
  if (cnMatch) {
    const num = parseCnNum(cnMatch[1]);
    if (num !== null) {
      // Check for A/B suffix after the Chinese group, e.g. 车缝三组A or (Sewing Line 3A)
      const suffixMatch = line.match(/车缝[一二三四五六七八九十]+组\s*[(\s]*[A-Za-z]*\s*(\d+)\s*([A-Z])[)\s]/i);
      if (suffixMatch) {
        return String(num).padStart(2, '0') + (suffixMatch[3] || '').toUpperCase();
      }
      return String(num).padStart(2, '0');
    }
  }

  // 3. Try bare number: just a number like "3" or "23"
  const bareMatch = line.match(/^(\d+)([A-Z])?$/i);
  if (bareMatch) {
    const num = parseInt(bareMatch[1], 10);
    const suffix = (bareMatch[2] || '').toUpperCase();
    return String(num).padStart(2, '0') + suffix;
  }

  return '99';
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
