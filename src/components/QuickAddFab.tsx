import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, motion, radius, spacing } from '../theme/tokens';
import { GlassSurface } from './glass/GlassSurface';

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
  const navigation = useNavigation<any>();
  const [open, setOpen] = useState(false);
  const reveal = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(reveal, {
      toValue: open ? 1 : 0,
      useNativeDriver: true,
      ...motion.glide,
    }).start();
  }, [open]);

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

      <View style={styles.dock} pointerEvents="box-none">
        <Action
          label="Add Income"
          icon="arrow-down-circle"
          color={theme.success}
          reveal={reveal}
          distance={148}
          delay={0.12}
          onPress={() => go('income')}
        />
        <Action
          label="Add Expense"
          icon="arrow-up-circle"
          color={theme.expense}
          reveal={reveal}
          distance={82}
          delay={0}
          onPress={() => go('expense')}
        />

        <Pressable
          onPressIn={() =>
            Animated.spring(press, { toValue: 1, useNativeDriver: true, ...motion.press }).start()
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
          <Animated.View style={[styles.fabWrap, { shadowColor: theme.tint, transform: [{ scale }] }]}>
            <LinearGradient
              colors={[theme.tint, theme.investment]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={[styles.fab, { borderColor: theme.glassBorder }]}
            >
              <Animated.View style={{ transform: [{ rotate }] }}>
                <Ionicons name="add" size={30} color="#FFFFFF" />
              </Animated.View>
            </LinearGradient>
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
  distance,
  delay,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  reveal: Animated.Value;
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
      pointerEvents="box-none"
      style={[styles.action, { opacity: progress, transform: [{ translateY }, { scale }] }]}
    >
      <Pressable onPress={onPress}>
        <GlassSurface level="raised" borderRadius={radius.pill} contentStyle={styles.actionInner}>
          <Ionicons name={icon} size={20} color={color} />
          <Text style={[styles.actionLabel, { color: theme.text }]}>{label}</Text>
        </GlassSurface>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', right: spacing.lg, bottom: 96, alignItems: 'flex-end' },
  action: { position: 'absolute', right: 0, bottom: 4 },
  actionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actionLabel: { fontSize: fontSizes.sm, fontWeight: '700' },
  fabWrap: {
    borderRadius: radius.pill,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  fab: {
    width: 62,
    height: 62,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
