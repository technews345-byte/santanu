import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the person has asked their phone to reduce motion.
 *
 * Every pane in a long list asks this, so it is one subscription held for the
 * whole app rather than a listener per row. Movement that is decoration — the
 * tilt, the travelling sheen, counting figures — stands down when it is on;
 * feedback that a touch landed stays, only without the travel.
 */
let reduced = false;
const listeners = new Set<() => void>();
let subscribed = false;

function ensureSubscribed() {
  if (subscribed) return;
  subscribed = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then((value) => {
      reduced = value;
      listeners.forEach((l) => l());
    })
    .catch(() => {});
  AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
    reduced = value;
    listeners.forEach((l) => l());
  });
}

function subscribe(listener: () => void) {
  ensureSubscribed();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isReducedMotion(): boolean {
  ensureSubscribed();
  return reduced;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => reduced, () => false);
}
