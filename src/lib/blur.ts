import { useSyncExternalStore } from 'react';
import type { View } from 'react-native';

// Hold the live ref, never a snapshot of the View — a snapshotted instance goes
// stale on unmount/reload and expo-blur's findNodeHandle then throws.
let target: { current: View | null } | null = null;
const listeners = new Set<() => void>();

/** Point the Android blur backdrop at the currently focused tab screen. */
export function setBlurTarget(ref: { current: View | null } | null) {
  target = ref;
  listeners.forEach((l) => l());
}

export function useBlurTarget() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => target,
  );
}
