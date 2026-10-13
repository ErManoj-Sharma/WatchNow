// Update check + share via GitHub releases of this private repo.
// No backend: the .env token (fine-grained PAT, Contents:read) authenticates
// the API and the APK asset download; EXPO_PUBLIC_* ships it in the bundle.
import Constants from 'expo-constants';
import { DownloadTask, File, Paths } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';

import { compareSemver, parseLatestRelease, type LatestRelease } from './update-core';

export { compareSemver };
export type { LatestRelease };

const REPO = 'ErManoj-Sharma/WatchNow';
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

function ghHeaders(accept: string): Record<string, string> {
  const token = process.env.EXPO_PUBLIC_GITHUB_TOKEN;
  return token ? { Accept: accept, Authorization: `Bearer ${token}` } : { Accept: accept };
}

export function getInstalledVersion(): string {
  return Constants.expoConfig?.version ?? '1.0.0';
}

/** Fetch the latest GitHub release; null when offline, unauthorised or no releases exist. */
export async function checkForLatestRelease(): Promise<LatestRelease | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: ghHeaders('application/vnd.github+json'),
    });
    if (!res.ok) return null;
    const release = parseLatestRelease(await res.json());
    if (!release) return null;
    return { ...release, url: release.url || RELEASES_URL };
  } catch {
    return null;
  }
}

/** Download the release APK (reusing a cached copy) and return its file URI. */
export async function downloadUpdate(onProgress?: (pct: number) => void): Promise<string> {
  const release = await checkForLatestRelease();
  if (!release) throw new Error('No release found');
  if (release.assetId == null) throw new Error('Release has no APK asset');
  const file = new File(Paths.cache, `WatchNow-${release.version}.apk`);
  if (file.exists) {
    onProgress?.(100);
    return file.uri;
  }
  onProgress?.(0);
  const task = new DownloadTask(`https://api.github.com/repos/${REPO}/releases/assets/${release.assetId}`, file, {
    headers: ghHeaders('application/octet-stream'),
    onProgress: ({ bytesWritten, totalBytes }) => {
      if (totalBytes > 0) onProgress?.(Math.min(100, Math.floor((bytesWritten / totalBytes) * 100)));
    },
  });
  await task.downloadAsync();
  return file.uri;
}

/** Open the Android package installer; false when unavailable (Expo Go / non-Android). */
export async function openInstaller(fileUri: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const IntentLauncher = await import('expo-intent-launcher');
    const contentUri = await getContentUriAsync(fileUri);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      type: 'application/vnd.android.package-archive',
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    });
    return true;
  } catch {
    return false;
  }
}

/** Download the update and hand it to the installer (share-sheet fallback). */
export async function installUpdate(onProgress?: (pct: number) => void): Promise<boolean> {
  const uri = await downloadUpdate(onProgress);
  if (await openInstaller(uri)) return true;
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/vnd.android.package-archive',
      dialogTitle: 'Install WatchNow',
    });
    return true;
  }
  return false;
}

/**
 * Share the installable APK with a friend (private repo — a link alone is
 * useless to them). Falls back to sharing the release link.
 */
export async function shareApp(onProgress?: (pct: number) => void): Promise<boolean> {
  try {
    const apk = await downloadUpdate(onProgress);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(apk, {
        mimeType: 'application/vnd.android.package-archive',
        dialogTitle: 'Share WatchNow',
      });
      return true;
    }
  } catch {
    // fall through to link share
  }
  await Share.share({
    message: `WatchNow — watch your own movies & shows offline. Get the app: ${RELEASES_URL}`,
  });
  return true;
}
