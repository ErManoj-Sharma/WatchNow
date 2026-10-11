// Update check + share via the public GitHub releases of this repo.
// No backend: compare installed app.json version against the latest release tag.
import Constants from 'expo-constants';
import { Share } from 'react-native';

export const RELEASES_URL = 'https://github.com/ErManoj-Sharma/WatchNow/releases/latest';

export function getInstalledVersion(): string {
  return Constants.expoConfig?.version ?? '1.0.0';
}

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

export type LatestRelease = { version: string; url: string };

/** Fetch the latest GitHub release; null when offline or no releases exist. */
export async function checkForLatestRelease(): Promise<LatestRelease | null> {
  try {
    const res = await fetch('https://api.github.com/repos/ErManoj-Sharma/WatchNow/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string; html_url?: string };
    const version = (data.tag_name ?? '').trim().replace(/^v/i, '');
    if (!version) return null;
    return { version, url: data.html_url || RELEASES_URL };
  } catch {
    return null;
  }
}

/** Opens the OS share sheet with a get-the-app link. */
export async function shareApp(): Promise<boolean> {
  await Share.share({
    message: `WatchNow — watch your own movies & shows offline. Get the app: ${RELEASES_URL}`,
  });
  return true;
}
