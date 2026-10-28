import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../theme/type';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from '../theme/useReducedMotion';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, motion, radius, spacing } from '../theme/tokens';
import { shade, withAlpha } from '../theme/color';
import { GlassSurface } from './glass/GlassSurface';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT } from './glass/GlassTabBar';
import { ROOM } from './glass/Aurora';

/**
 * The button opens into its own choices rather than jumping straight to a
 * form: the two things anyone reaches for are one tap away, and the button
 * itself becomes the dismiss target.
 *
 * The actions spring out along the axis they will occupy, staggered so they
 * arrive one after the other instead of appearing as a block, and the plus
 * rotates into a cross so the same control plainly undoes itself.
 */
export function QuickAddFab() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const reveal = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;
  const window = useWindowDimensions();
  const dark = theme.mode === 'dark';
  const dockBottom = Math.max(insets.bottom, spacing.sm) + TAB_BAR_HEIGHT + 12;
  // Where the button sits in the window, so its copy of the backdrop lines
  // up. Worked out from where it is placed rather than measured: a screen
  // still sliding in when the button first lays out would give a position
  // that is wrong once it lands.
  const origin = { x: window.width - spacing.lg - FAB_SIZE, y: window.height - dockBottom - FAB_SIZE };

  useEffect(() => {
    if (reduced) { reveal.stopAnimation(); reveal.setValue(open ? 1 : 0); return; }
    const animation = Animated.spring(reveal, {
      toValue: open ? 1 : 0,
      useNativeDriver: true,
      ...motion.glide,
    });
    animation.start();
    return () => animation.stop();
  }, [open, reduced, reveal]);

  const go = (initialType: 'expense' | 'income') => {
    setOpen(false);
    navigation.navigate('TransactionEntry', { initialType });
  };

  const rotate = reveal.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '135deg'] });
  const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] });

  return (
    <>
      {open && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: theme.overlay, opacity: reveal },
            ]}
          />
        </Pressable>
      )}

      {/* Clear of the tab bar, wherever the phone's own navigation puts it. */}
      <View style={[styles.dock, { bottom: dockBottom }]} pointerEvents="box-none">
        <Action
          label="Scan Receipt"
          icon="scan"
          color={theme.teal}
          reveal={reveal}
          open={open}
          distance={214}
          delay={0.24}
          onPress={() => {
            setOpen(false);
            navigation.navigate('ScanReceipt');
          }}
        />
        <Action
          label="Add Income"
          icon="arrow-down-circle"
          color={theme.success}
          reveal={reveal}
          open={open}
          distance={148}
          delay={0.12}
          onPress={() => go('income')}
        />
        <Action
          label="Add Expense"
          icon="arrow-up-circle"
          color={theme.expense}
          reveal={reveal}
          open={open}
          distance={82}
          delay={0}
          onPress={() => go('expense')}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? "Close quick actions" : "Add transaction"}
          accessibilityState={{ expanded: open }}
          onPressIn={() =>
            Animated.spring(press, { toValue: reduced ? 0 : 1, useNativeDriver: true, ...motion.press }).start()
          }
          onPressOut={() =>
            Animated.spring(press, { toValue: 0, useNativeDriver: true, ...motion.press }).start()
          }
          onPress={() => {
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            }
            setOpen((v) => !v);
          }}
        >
          <Animated.View style={[styles.fabWrap, { transform: [{ scale: reduced ? 1 : scale }] }]}>
            {/* Clear glass: the backdrop seen through it, frosted. The button
                carries its own copy of the backdrop, blurred once and lined up
                with the real one, so it costs nothing per frame. */}
            <View style={[StyleSheet.absoluteFill, styles.fabClip]} pointerEvents="none">
              <Image
                source={dark ? ROOM.dark : ROOM.light}
                blurRadius={16}
                fadeDuration={0}
                resizeMode="cover"
                style={{ position: 'absolute', left: -origin.x, top: -origin.y, width: window.width, height: window.height }}
              />
            </View>
            <GlassSurface
              level="control"
              blur={false}
              borderRadius={radius.pill}
              contentStyle={styles.fab}
              tint={withAlpha(theme.tint, dark ? 0.24 : 0.2)}
              tintBorder={dark ? 'rgba(235, 242, 255, 0.55)' : 'rgba(255, 255, 255, 0.95)'}
            >
              {/* Light gathered inside the lower edge, where it comes back
                  through the glass tinted with its colour. */}
              <LinearGradient
                colors={['transparent', withAlpha(shade(theme.tint, 0.2), dark ? 0.45 : 0.35)]}
                start={{ x: 0.5, y: 0.45 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              {/* Gloss over the top */}
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.55)', 'rgba(255, 255, 255, 0)']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.specular}
                pointerEvents="none"
              />
              <Animated.View style={{ transform: [{ rotate }] }}>
                <Ionicons name="add" size={32} color={dark ? '#FFFFFF' : theme.tint} style={styles.plus} />
              </Animated.View>
            </GlassSurface>
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
}

function Action({
  label,
  icon,
  color,
  reveal,
  open,
  distance,
  delay,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  reveal: Animated.Value;
  open: boolean;
  distance: number;
  delay: number;
  onPress: () => void;
}) {
  const { theme } = useTheme();

  // Each action starts a little later than the one below it, so they arrive
  // in sequence rather than as one block.
  const progress = reveal.interpolate({
    inputRange: [delay, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, -distance] });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

  return (
    <Animated.View
      pointerEvents={open ? 'box-none' : 'none'}
      aria-hidden={!open}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      style={[styles.action, { opacity: progress, transform: [{ translateY }, { scale }] }]}
    >
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}>
        <GlassSurface level="control" blur={false} opaque borderRadius={radius.pill} contentStyle={styles.actionInner}>
          <Ionicons name={icon} size={20} color={color} />
          <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.actionLabel, { color: theme.text }]}>
            {label}
          </Text>
        </GlassSurface>
      </Pressable>
    </Animated.View>
  );
}

const FAB_SIZE = 62;

const styles = StyleSheet.create({
  // Wide enough for the actions' labels: an absolute child is measured within
  // its parent, and the button alone left them room for a few letters a line.
  dock: { position: 'absolute', right: spacing.lg, width: 220, alignItems: 'flex-end' },
  action: { position: 'absolute', right: 0, bottom: 4 },
  actionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actionLabel: { fontSize: fontSizes.xs, fontWeight: '700' },
  fabWrap: {
    borderRadius: radius.pill,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    // No Android elevation: the button is tinted glass, and the shadow would
    // show through it as a dark shape inside.
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabClip: { borderRadius: radius.pill, overflow: 'hidden' },
  specular: { position: 'absolute', top: 2, left: 9, right: 9, height: 26, borderRadius: 13 },
  plus: { textShadowColor: 'rgba(0, 0, 0, 0.25)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
});
