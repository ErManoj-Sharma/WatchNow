import { useSyncExternalStore } from 'react';
import type { View } from 'react-native';

let target: View | null = null;
const listeners = new Set<() => void>();

/** Point the Android blur backdrop at the currently focused tab screen. */
export function setBlurTarget(view: View | null) {
  target = view;
  listeners.forEach((l) => l());
}

export function useBlurTarget(): View | null {
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
