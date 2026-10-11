import { Directory } from 'expo-file-system';

export type PickedFolder = { uri: string; name: string };

export async function pickMovieFolder(): Promise<PickedFolder | null> {
  try {
    const dir = await Directory.pickDirectoryAsync();
    if (!dir?.uri) return null;
    return { uri: dir.uri.replace(/\/+$/, ''), name: dir.name || 'Movie' };
  } catch {
    return null;
  }
}

export function folderStillAccessible(uri: string): boolean {
  try {
    const dir = new Directory(uri);
    if (!dir.exists) return false;
    dir.list();
    return true;
  } catch {
    return false;
  }
}
