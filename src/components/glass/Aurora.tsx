import React, { createContext, RefObject, useEffect, useId, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { skin } from '../../theme/skin';
import { useAmbientMotion } from '../../theme/useAmbientMotion';

export const BlurTargetContext = createContext<RefObject<View | null> | null>(null);
// Static fallback for the quick-add button. The dock uses the same gradient as the room.
export const ROOM = { dark: require('../../../assets/space-dark.webp'), light: require('../../../assets/space-light.webp') };

export function Aurora({ ambient = true }: { ambient?: boolean }) {
  const allowed = useAmbientMotion();
  const drift = useRef(new Animated.Value(0)).current;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  useEffect(() => {
    if (!ambient || !allowed) { drift.stopAnimation(); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.spring(drift, { toValue: 1, stiffness: 0.12, damping: 1, mass: 4, useNativeDriver: true, isInteraction: false }),
      Animated.spring(drift, { toValue: 0, stiffness: 0.12, damping: 1, mass: 4, useNativeDriver: true, isInteraction: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [allowed, ambient, drift]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={skin.background} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.overscan, { transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-12, 14] }) }, { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 24] }) }] }]}>
        <Svg width="100%" height="100%" viewBox="0 0 393 852" preserveAspectRatio="none">
          <Defs>
            {[
              { name: 'a', x: '5%', y: '0%', r: '85%', color: skin.azure, opacity: 0.36 },
              { name: 'b', x: '100%', y: '45%', r: '65%', color: skin.blue, opacity: 0.36 },
              { name: 'c', x: '10%', y: '85%', r: '55%', color: skin.violet, opacity: 0.18 },
              { name: 'd', x: '90%', y: '95%', r: '35%', color: skin.cyan, opacity: 0.10 },
            ].map(g => <RadialGradient key={g.name} id={uid + g.name} cx={g.x} cy={g.y} rx={g.r} ry={g.r}><Stop offset="0" stopColor={g.color} stopOpacity={g.opacity} /><Stop offset="1" stopColor={g.color} stopOpacity={0} /></RadialGradient>)}
          </Defs>
          {['a', 'b', 'c', 'd'].map(g => <Rect key={g} width="393" height="852" fill={`url(#${uid + g})`} />)}
        </Svg>
      </Animated.View>
      <LinearGradient colors={['transparent', 'rgba(77,163,255,0.07)', 'transparent']} locations={[0.38, 0.5, 0.63]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.55 }} style={StyleSheet.absoluteFill} />
    </View>
  );
}

// The light fields move within an oversized surface, so no unlit strip can
// appear at the display edges as the glow drifts.
const styles = StyleSheet.create({ overscan: { position: 'absolute', top: -40, right: -32, bottom: -40, left: -32 } });
