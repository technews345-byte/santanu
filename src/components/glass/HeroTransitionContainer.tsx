import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Text } from '../../theme/type';
import { useTheme } from '../../theme/ThemeContext';
import { useReducedMotion } from '../../theme/useReducedMotion';
import { skin } from '../../theme/skin';
import { Aurora } from './Aurora';

export type HeroDetail = 'balance' | 'spending' | 'budget';
type Bounds = { x: number; y: number; width: number; height: number };
type OpenCard = Bounds & { detail: HeroDetail; title: string };
const HeroContext = createContext<{ open: (view: View | null, detail: HeroDetail, title: string) => void }>({ open() {} });

/** Measures the actual card in window coordinates; no hard-coded card positions. */
export function HeroTransitionContainer({ children, renderDetail }: {
  children: React.ReactNode; renderDetail: (detail: HeroDetail, close: (after?: () => void) => void) => React.ReactNode;
}) {
  const [card, setCard] = useState<OpenCard | null>(null);
  const progress = useSharedValue(0);
  const reduced = useReducedMotion();
  const opening = useRef(false);
  const open = useCallback((view: View | null, detail: HeroDetail, title: string) => {
    if (!view || opening.current) return;
    opening.current = true;
    view.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) { opening.current = false; return; }
      progress.value = 0;
      setCard({ x, y, width, height, detail, title });
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    });
  }, [progress]);
  const restore = useCallback(() => { setCard(null); opening.current = false; progress.value = 0; }, [progress]);
  const sourceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [1, 0.6]),
    transform: [{ scale: reduced ? 1 : interpolate(progress.value, [0, 1], [1, 0.94]) }],
  }), [reduced]);
  return <HeroContext.Provider value={{ open }}>
    <View pointerEvents="none" style={StyleSheet.absoluteFill}><Aurora ambient={false} /></View>
    <Animated.View style={[styles.flex, sourceStyle]} accessibilityElementsHidden={!!card} importantForAccessibility={card ? 'no-hide-descendants' : 'auto'}>
      {children}
    </Animated.View>
    {card && <HeroOverlay card={card} progress={progress} restore={restore} renderDetail={renderDetail} />}
  </HeroContext.Provider>;
}

export function HeroCard({ children, detail, title }: { children: (open: () => void) => React.ReactNode; detail: HeroDetail; title: string }) {
  const ref = useRef<View>(null);
  const hero = useContext(HeroContext);
  return <View ref={ref} collapsable={false}>{children(() => hero.open(ref.current, detail, title))}</View>;
}

function HeroOverlay({ card, progress, restore, renderDetail }: {
  card: OpenCard; progress: SharedValue<number>; restore: () => void;
  renderDetail: (detail: HeroDetail, close: (after?: () => void) => void) => React.ReactNode;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const start = useSharedValue(1);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; cancelAnimation(progress); }, [progress]);
  const finish = useCallback((after?: () => void) => { if (!alive.current) return; restore(); after?.(); }, [restore]);
  const close = useCallback((after?: () => void) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
    const done = (finished?: boolean) => { 'worklet'; if (finished) runOnJS(finish)(after); };
    progress.value = reduced ? withTiming(0, { duration: skin.fadeMs }, done) : withSpring(0, skin.spring, done);
  }, [finish, progress, reduced]);
  useEffect(() => {
    progress.value = reduced ? withTiming(1, { duration: skin.fadeMs }) : withSpring(1, skin.spring);
  }, [progress, reduced]);

  // A dedicated header and edge gesture leave vertical content scrolling free.
  // Capturing the current progress on begin makes opening/closing interruptible.
  const pan = (edge: boolean) => Gesture.Pan().enabled(!reduced).minDistance(4)
    .onStart(() => { cancelAnimation(progress); start.value = progress.value; })
    .onUpdate(e => {
      const distance = edge ? e.translationX : e.translationY;
      progress.value = Math.max(0, Math.min(1, start.value - distance / (edge ? width * 0.8 : height * 0.55)));
    })
    .onEnd(e => {
      const velocity = edge ? e.velocityX : e.velocityY;
      if (progress.value < 0.72 || velocity > 900) {
        progress.value = withSpring(0, { ...skin.spring, velocity: -velocity / height }, finished => { if (finished) runOnJS(finish)(); });
      } else progress.value = withSpring(1, skin.spring);
    })
    .onFinalize((_e, success) => { if (!success) progress.value = withSpring(1, skin.spring); });
  const pane = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, progress.value));
    return {
      opacity: reduced ? p : 1,
      borderRadius: interpolate(p, [0, 1], [skin.cardRadius, 0]),
      transform: reduced ? [] : [
        { translateX: (card.x + card.width / 2 - width / 2) * (1 - p) },
        { translateY: (card.y + card.height / 2 - height / 2) * (1 - p) },
        { scaleX: interpolate(p, [0, 1], [card.width / width, 1]) },
        { scaleY: interpolate(p, [0, 1], [card.height / height, 1]) },
      ],
    };
  }, [card, width, height, reduced]);
  const content = useAnimatedStyle(() => ({ opacity: reduced ? 1 : interpolate(progress.value, [0.3, 0.85], [0, 1], 'clamp') }), [reduced]);
  return <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => close()}>
    <GestureHandlerRootView style={styles.flex}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.pane, pane]} accessibilityViewIsModal>
        <Aurora ambient={false} />
        <Animated.View style={[styles.flex, content]}>
          <GestureDetector gesture={pan(false)}>
            <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 20, paddingBottom: 16 }}>
              <View style={[styles.handle, { backgroundColor: theme.textTertiary }]} />
              <View style={styles.heading}>
                <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 26, fontWeight: '300', flex: 1 }}>{card.title}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Close ${card.title}`} onPress={() => close()} style={styles.close}>
                  <Ionicons name="close-outline" size={25} color={theme.text} />
                </Pressable>
              </View>
            </View>
          </GestureDetector>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 16 }} showsVerticalScrollIndicator={false}>
            {renderDetail(card.detail, close)}
          </ScrollView>
          <GestureDetector gesture={pan(true)}><Animated.View style={styles.edge} accessible={false} /></GestureDetector>
        </Animated.View>
      </Animated.View>
    </GestureHandlerRootView>
  </Modal>;
}
const styles = StyleSheet.create({
  flex: { flex: 1 }, pane: { backgroundColor: '#050B2E', overflow: 'hidden' },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, opacity: 0.5, marginBottom: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)' },
  edge: { position: 'absolute', left: 0, top: '25%', bottom: 0, width: 18 },
});
