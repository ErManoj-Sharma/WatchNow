import { stripTechnicalTokens } from '@/features/classification/parse';

const YEAR_RE = /\b(19\d{2}|20\d{2})\b/g;

export function extractYear(text: string): number | null {
  // Last year-like token: release year sits after the title (titles may contain
  // year-like numbers such as "2001" or "Blade Runner 2049").
  let year: number | null = null;
  for (const m of text.matchAll(YEAR_RE)) year = Number(m[1]);
  return year;
}

export function normalizeTitle(text: string): string {
  return stripTechnicalTokens(text.replace(/[[\](){}]/g, ' '))
    .replace(YEAR_RE, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toLowerCase();
}

export function queryTitleOf(text: string): string {
  return stripTechnicalTokens(text.replace(/[[\](){}]/g, ' '))
    .replace(YEAR_RE, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const MIN_CONTAINMENT_LEN = 5;

export function isMetadataMatch(
  fileTitle: string,
  resultTitle: string,
  fileYear: number | null,
  resultYear: number | null,
): boolean {
  const a = normalizeTitle(fileTitle);
  const b = normalizeTitle(resultTitle);
  if (!a || !b) return false;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  const titleOk = a === b || (shorter.length >= MIN_CONTAINMENT_LEN && longer.includes(shorter));
  if (!titleOk) return false;
  if (fileYear != null && resultYear != null && Math.abs(fileYear - resultYear) > 1) return false;
  return true;
}
