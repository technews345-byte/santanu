import React, { forwardRef } from 'react';
import {
  Platform,
  StyleProp,
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  TextInputProps,
  TextProps,
  TextStyle,
} from 'react-native';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';

/**
 * The app's two typefaces.
 *
 * The interface is set in SF Pro. On iPhone that is simply the system font.
 * Apple licenses SF Pro for its own platforms only, so Android and the web
 * use Inter instead: it was drawn to the same brief, a neutral grotesque that
 * holds up at small sizes, and sits closest to SF Pro of the open faces.
 *
 * Manrope carries the large type — balances, big figures and screen titles —
 * everywhere, which is where its rounder, more geometric figures give the app
 * its own voice. Anything set at display size takes it automatically, so a
 * number never changes typeface depending on which screen drew it.
 *
 * Custom faces ship one file per weight, and Android fakes bold rather than
 * finding the heavier file when asked for a weight, so each style's weight is
 * translated here into the file that draws it.
 */
export const fontAssets = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
};

/** Set as a style's fontFamily to ask for the display face at any size. */
export const DISPLAY = 'Manrope';

/** From this size up, type is display type. */
const DISPLAY_SIZE = 24;

type Weight = '400' | '500' | '600' | '700' | '800';

const INTER: Record<Weight, string> = {
  '400': 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  // Body text never goes heavier than bold.
  '700': 'Inter_700Bold',
  '800': 'Inter_700Bold',
};

const MANROPE: Record<Weight, string> = {
  '400': 'Manrope_400Regular',
  '500': 'Manrope_500Medium',
  '600': 'Manrope_600SemiBold',
  '700': 'Manrope_700Bold',
  '800': 'Manrope_800ExtraBold',
};

function weightOf(weight: TextStyle['fontWeight']): Weight {
  if (weight === 'bold') return '700';
  const n = typeof weight === 'number' ? weight : Number(weight);
  if (!Number.isFinite(n) || n < 450) return '400';
  if (n < 550) return '500';
  if (n < 650) return '600';
  if (n < 750) return '700';
  return '800';
}

/**
 * The face a style should be drawn in, as a style to lay over it, or null
 * when the platform default already is the right one. A style naming some
 * other family (monospace, say) is left alone.
 */
export function typeface(style: StyleProp<TextStyle>): TextStyle | null {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const family = flat.fontFamily;
  if (family && family !== DISPLAY) return null;
  const weight = weightOf(flat.fontWeight);
  const display = family === DISPLAY || (flat.fontSize ?? 0) >= DISPLAY_SIZE;
  if (display) return { fontFamily: MANROPE[weight], fontWeight: 'normal' };
  if (Platform.OS === 'ios') return null;
  return { fontFamily: INTER[weight], fontWeight: 'normal' };
}

function withFace<S extends StyleProp<TextStyle>>(style: S): StyleProp<TextStyle> {
  const face = typeface(style);
  return face ? [style, face] : style;
}

/** React Native's Text, in the app's type. */
export const Text = forwardRef<RNText, TextProps>(function Text({ style, ...rest }, ref) {
  return <RNText ref={ref} {...rest} style={withFace(style)} />;
});

/** React Native's TextInput, in the app's type. */
export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput({ style, ...rest }, ref) {
  return <RNTextInput ref={ref} {...rest} style={withFace(style)} />;
});
