export const semantic = {
  success: '#00C08B',
  successMuted: 'rgba(0, 192, 139, 0.16)',
  expense: '#FF5C7A',
  expenseMuted: 'rgba(255, 92, 122, 0.16)',
  transfer: '#22B8F0',
  transferMuted: 'rgba(34, 184, 240, 0.16)',
  investment: '#8B5CF6',
  investmentMuted: 'rgba(139, 92, 246, 0.16)',
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

  /**
   * Opaque fill for panes that hide something behind them — a row over its
   * own swipe actions, or chrome that must stay readable over any content.
   */
  surfaceSolid: string;
  /** Translucent panel fill. Opaque enough that figures stay readable on it. */
  glass: string;
  /** A second, heavier fill for panels that carry the largest numbers. */
  glassStrong: string;
  /** The lit edge that gives a panel its thickness. */
  glassBorder: string;
  /** The highlight running along the top of a panel, as light would catch it. */
  glassSheen: string;
  /** Tint painted under the blur, since blur alone has no colour of its own. */
  glassTint: 'light' | 'dark';
  /** How far the background is thrown out of focus behind a panel. */
  blurIntensity: number;
  /** Wash behind the whole screen, from which panels appear to be cut. */
  auroraOne: string;
  auroraTwo: string;
  auroraThree: string;
}

export const lightTheme: Theme = {
  mode: 'light',
  bg: '#EEF3FC',
  surface: 'rgba(255, 255, 255, 0.52)',
  surfaceAlt: 'rgba(255, 255, 255, 0.40)',
  surfaceRaised: 'rgba(255, 255, 255, 0.62)',
  border: 'rgba(255, 255, 255, 0.85)',
  borderSubtle: 'rgba(148, 163, 184, 0.22)',
  text: '#0B1220',
  textSecondary: '#46536B',
  textTertiary: '#8492AC',
  textInverted: '#F8FAFC',
  tint: '#3B5BFF',
  tintMuted: 'rgba(59, 91, 255, 0.12)',
  shadow: 'rgba(30, 58, 138, 0.13)',
  overlay: 'rgba(15, 23, 42, 0.38)',
  surfaceSolid: '#FBFCFF',
  glass: 'rgba(255, 255, 255, 0.46)',
  glassStrong: 'rgba(255, 255, 255, 0.60)',
  glassBorder: 'rgba(255, 255, 255, 0.95)',
  glassSheen: 'rgba(255, 255, 255, 0.62)',
  glassTint: 'light',
  blurIntensity: 34,
  auroraOne: 'rgba(59, 91, 255, 0.22)',
  auroraTwo: 'rgba(139, 92, 246, 0.20)',
  auroraThree: 'rgba(34, 184, 240, 0.18)',
  ...semantic,
};

// Not an inversion of the light theme: the panels are navy glass lit from
// within, rather than white panels turned down.
export const darkTheme: Theme = {
  mode: 'dark',
  bg: '#070C1A',
  surface: 'rgba(30, 44, 78, 0.62)',
  surfaceAlt: 'rgba(22, 33, 60, 0.55)',
  surfaceRaised: 'rgba(38, 54, 92, 0.72)',
  border: 'rgba(129, 158, 255, 0.22)',
  borderSubtle: 'rgba(129, 158, 255, 0.12)',
  text: '#F4F8FF',
  textSecondary: '#A9B8D6',
  textTertiary: '#6F7F9E',
  textInverted: '#070C1A',
  tint: '#6E8BFF',
  tintMuted: 'rgba(110, 139, 255, 0.2)',
  shadow: 'rgba(0, 0, 0, 0.55)',
  overlay: 'rgba(3, 7, 18, 0.62)',
  surfaceSolid: '#141E36',
  glass: 'rgba(30, 44, 78, 0.46)',
  glassStrong: 'rgba(36, 52, 90, 0.60)',
  glassBorder: 'rgba(140, 168, 255, 0.24)',
  glassSheen: 'rgba(160, 190, 255, 0.14)',
  glassTint: 'dark',
  blurIntensity: 42,
  auroraOne: 'rgba(59, 91, 255, 0.15)',
  auroraTwo: 'rgba(139, 92, 246, 0.13)',
  auroraThree: 'rgba(34, 184, 240, 0.10)',
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
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
};

/**
 * One motion vocabulary for the whole app. Springs rather than durations, so
 * a gesture interrupted halfway carries its velocity into the next movement
 * instead of restarting.
 */
export const motion = {
  /** Finger-follows-glass: quick to depart, settles without wobbling. */
  press: { damping: 22, stiffness: 320, mass: 0.7 },
  /** An indicator gliding to a new tab. */
  glide: { damping: 20, stiffness: 180, mass: 0.9 },
  /** Something arriving on screen. */
  enter: { damping: 18, stiffness: 140, mass: 1 },
  pressScale: 0.975,
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
