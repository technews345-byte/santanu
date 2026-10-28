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
// Each weight from its own entry point: the packages' main entry requires
// every weight and italic they have (25 files, 7 MB), and the bundler ships
// whatever is required, used or not.
import { Inter_300Light } from '@expo-google-fonts/inter/300Light';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
/** SF Pro through the iOS system font; Inter on Android and web. */
export const fontAssets = {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
};

/** Set as a style's fontFamily to ask for the display face at any size. */
export const DISPLAY = 'SystemDisplay';

type Weight = '400' | '500' | '600' | '700' | '800';

const INTER: Record<Weight, string> = {
  '400': 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  // Body text never goes heavier than bold.
  '700': 'Inter_700Bold',
  '800': 'Inter_700Bold',
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
  if (Platform.OS === 'ios') return family === DISPLAY ? { fontFamily: 'System' } : null;
  if (flat.fontWeight === '300' || flat.fontWeight === 300) return { fontFamily: 'Inter_300Light', fontWeight: 'normal' };
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
