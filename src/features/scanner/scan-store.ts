import { useSyncExternalStore } from 'react';

import { IDLE_PROGRESS, scanActiveRoot, type ScanProgress } from './scanner';

let snapshot: ScanProgress = IDLE_PROGRESS;
let listeners = new Set<() => void>();
let cancelRequested = false;
let running = false;

function emit(next: ScanProgress) {
  snapshot = next;
  for (const l of listeners) l();
}

export function getScanSnapshot(): ScanProgress {
  return snapshot;
}

function subscribeScan(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useScanState(): ScanProgress {
  return useSyncExternalStore(subscribeScan, getScanSnapshot);
}

export function isScanRunning(): boolean {
  return running;
}

export async function startScan(): Promise<void> {
  if (running) return;
  running = true;
  cancelRequested = false;
  emit({ ...IDLE_PROGRESS, status: 'scanning' });
  try {
    await scanActiveRoot(emit, () => cancelRequested);
  } catch (error) {
    emit({
      ...snapshot,
      status: 'error',
      errors: [...snapshot.errors, error instanceof Error ? error.message : String(error)].slice(0, 20),
      errorCount: snapshot.errorCount + 1,
    });
  } finally {
    running = false;
  }
}

export function cancelScan() {
  cancelRequested = true;
}
