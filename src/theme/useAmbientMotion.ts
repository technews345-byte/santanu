import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Battery from 'expo-battery';
import { useIsFocused } from '@react-navigation/native';
import { useReducedMotion } from './useReducedMotion';

/** Decorative motion stops offscreen, in the background and in low power mode. */
export function useAmbientMotion() {
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [lowPower, setLowPower] = useState(true);
  useEffect(() => {
    let live = true;
    const refresh = () => {
      if (Platform.OS === 'web') { setLowPower(false); return; }
      Battery.isLowPowerModeEnabledAsync().then(v => { if (live) setLowPower(v); }).catch(() => {});
    };
    refresh();
    const app = AppState.addEventListener('change', state => { setActive(state === 'active'); if (state === 'active') refresh(); });
    const battery = Platform.OS === 'web' ? null : Battery.addLowPowerModeListener(event => setLowPower(event.lowPowerMode));
    return () => { live = false; app.remove(); battery?.remove(); };
  }, []);
  return !reduced && focused && active && !lowPower;
}
