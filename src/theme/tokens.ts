export const semantic = {
  success: '#10B981',
  successMuted: 'rgba(16, 185, 129, 0.14)',
  expense: '#F43F5E',
  expenseMuted: 'rgba(244, 63, 94, 0.14)',
  transfer: '#6366F1',
  transferMuted: 'rgba(99, 102, 241, 0.14)',
  investment: '#8B5CF6',
  investmentMuted: 'rgba(139, 92, 246, 0.14)',
  warning: '#F59E0B',
  warningMuted: 'rgba(245, 158, 11, 0.16)',
  danger: '#EF4444',
  dangerMuted: 'rgba(239, 68, 68, 0.16)',
};

export interface Theme {
  mode: 'light' | 'dark';
  bg: string;
  surface: string;
  surfaceAlt: string;
  surfaceRaised: string;
  border: string;
  borderSubtle: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  textInverted: string;
  tint: string;
  tintMuted: string;
  shadow: string;
  overlay: string;
  success: string;
  successMuted: string;
  expense: string;
  expenseMuted: string;
  transfer: string;
  transferMuted: string;
  investment: string;
  investmentMuted: string;
  warning: string;
  warningMuted: string;
  danger: string;
  dangerMuted: string;
}

export const lightTheme: Theme = {
  mode: 'light',
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F5F9',
  surfaceRaised: '#FFFFFF',
  border: '#E2E8F0',
  borderSubtle: '#EEF2F6',
  text: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  textInverted: '#F8FAFC',
  tint: '#6366F1',
  tintMuted: 'rgba(99, 102, 241, 0.12)',
  shadow: 'rgba(15, 23, 42, 0.08)',
  overlay: 'rgba(15, 23, 42, 0.45)',
  ...semantic,
};

export const darkTheme: Theme = {
  mode: 'dark',
  bg: '#0F172A',
  surface: '#1A2436',
  surfaceAlt: '#151E2E',
  surfaceRaised: '#212D42',
  border: '#2B3A52',
  borderSubtle: '#1F2A3D',
  text: '#F8FAFC',
  textSecondary: '#B6C2D4',
  textTertiary: '#7C8AA3',
  textInverted: '#0F172A',
  tint: '#818CF8',
  tintMuted: 'rgba(129, 140, 248, 0.18)',
  shadow: 'rgba(0, 0, 0, 0.4)',
  overlay: 'rgba(0, 0, 0, 0.6)',
  ...semantic,
};

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
};

export const fontSizes = {
  xs: 12,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  xxl: 30,
  xxxl: 36,
  display: 44,
};

export const categoryPalette = [
  '#6366F1',
  '#F43F5E',
  '#10B981',
  '#F59E0B',
  '#0EA5E9',
  '#A855F7',
  '#EC4899',
  '#14B8A6',
  '#F97316',
  '#84CC16',
  '#3B82F6',
  '#D946EF',
];
