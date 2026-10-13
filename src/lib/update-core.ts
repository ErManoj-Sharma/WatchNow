// Pure update helpers — no React Native imports, so tests run under tsx.

export type LatestRelease = { version: string; url: string; assetId: number | null };

/** Simple dotted-decimal compare: >0 if a>b, <0 if a<b, 0 if equal. */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/** Parse a GitHub /releases/latest payload; null when the tag is missing/empty. */
export function parseLatestRelease(data: unknown): LatestRelease | null {
  const d = data as {
    tag_name?: string;
    html_url?: string;
    assets?: { name?: string; id?: number }[];
  } | null;
  const version = (d?.tag_name ?? '').trim().replace(/^v/i, '');
  if (!version) return null;
  const apk = (d?.assets ?? []).find((a) => a.name?.toLowerCase().endsWith('.apk'));
  return { version, url: d?.html_url ?? '', assetId: apk?.id ?? null };
}
