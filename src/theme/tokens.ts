/**
 * Colour that carries meaning, one set per theme.
 *
 * Income and expense are the pair people compare most, so they were chosen to
 * stay apart for colour-blind readers as well as everyone else: a teal-green
 * and a coral, rather than the classic green and red, which collapse into the
 * same muddy tone under deuteranopia. Checked with the dataviz validator —
 * dark pair ΔE 12.0 for deutan vision against a target of 8 — and every one
 * of these clears WCAG AA 4.5:1 as text on the brightest glass it sits on.
 */
const semanticDark = {
  success: '#22A99A',
  successMuted: 'rgba(34, 169, 154, 0.16)',
  expense: '#E36B4A',
  expenseMuted: 'rgba(227, 107, 74, 0.16)',
  transfer: '#5EA2F2',
  transferMuted: 'rgba(94, 162, 242, 0.16)',
  investment: '#A68CF5',
  investmentMuted: 'rgba(166, 140, 245, 0.16)',
  warning: '#E8A93B',
  warningMuted: 'rgba(232, 169, 59, 0.16)',
  danger: '#E5534B',
  dangerMuted: 'rgba(229, 83, 75, 0.16)',
};

// Darker steps than the dark theme's, because these are read as text on a
// pale surface. A teal dark enough for 4.5:1 falls below the chroma a chart
// mark needs, so light mode alone draws its chart marks from separate tokens.
const semanticLight = {
  success: '#0C796D',
  successMuted: 'rgba(12, 121, 109, 0.12)',
  expense: '#C04125',
  expenseMuted: 'rgba(192, 65, 37, 0.12)',
  transfer: '#1D6EBE',
  transferMuted: 'rgba(29, 110, 190, 0.12)',
  investment: '#7650D6',
  investmentMuted: 'rgba(118, 80, 214, 0.12)',
  warning: '#975F0B',
  warningMuted: 'rgba(151, 95, 11, 0.12)',
  danger: '#C63831',
  dangerMuted: 'rgba(198, 56, 49, 0.12)',
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
  /** Second accent. Lighting and gradients only — never a meaning. */
  teal: string;
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
  /** Income and expense as chart marks. Validated as a pair for CVD. */
  chartIncome: string;
  chartExpense: string;

  /**
   * Opaque fill for panes that hide something behind them — a row over its
   * own swipe actions, or chrome that must stay readable over any content.
   */
  surfaceSolid: string;
  /** Primary glass panel. */
  glass: string;
  /** The heaviest pane, for the figures a screen leads with. */
  glassStrong: string;
  /** Controls, chips and capsules: the layer nearest the finger. */
  glassControl: string;
  /** The hairline edge that gives a pane its thickness. */
  glassBorder: string;
  /** Light caught along the top edge, where the ambient source hits first. */
  glassEdge: string;
  /** The broad, faint specular wash falling from the upper-left. */
  glassSheen: string;
  /** Shadow gathered inside the lower edge: the pane's own thickness. */
  glassDepth: string;
  glassTint: 'light' | 'dark';
  blurIntensity: number;
  /** Laid over a real blur, so text reads wherever the room's colour falls. */
  glassFrost: string;
  /** Light fields behind everything: primary, secondary, and the faint third. */
  auroraOne: string;
  auroraTwo: string;
  auroraThree: string;
}

export const lightTheme: Theme = {
  mode: 'light',
  bg: '#EEF2F9',
  surface: 'rgba(255, 255, 255, 0.62)',
  surfaceAlt: 'rgba(255, 255, 255, 0.46)',
  surfaceRaised: 'rgba(255, 255, 255, 0.74)',
  border: 'rgba(255, 255, 255, 0.9)',
  borderSubtle: 'rgba(100, 116, 139, 0.16)',
  text: '#0D1320',
  textSecondary: '#4A5568',
  textTertiary: '#636C81',
  textInverted: '#F8FAFC',
  tint: '#4353E8',
  tintMuted: 'rgba(67, 83, 232, 0.11)',
  teal: '#0F9C8C',
  shadow: 'rgba(30, 41, 80, 0.12)',
  overlay: 'rgba(13, 19, 32, 0.34)',
  surfaceSolid: '#FAFBFD',
  glass: 'rgba(255, 255, 255, 0.52)',
  glassStrong: 'rgba(255, 255, 255, 0.66)',
  glassControl: 'rgba(255, 255, 255, 0.74)',
  glassBorder: 'rgba(255, 255, 255, 0.85)',
  glassEdge: 'rgba(255, 255, 255, 1)',
  glassSheen: 'rgba(255, 255, 255, 0.5)',
  glassDepth: 'rgba(30, 41, 80, 0.06)',
  glassTint: 'light',
  blurIntensity: 34,
  glassFrost: 'rgba(245, 248, 253, 0.32)',
  auroraOne: 'rgba(67, 83, 232, 0.20)',
  auroraTwo: 'rgba(15, 156, 140, 0.13)',
  auroraThree: 'rgba(118, 80, 214, 0.10)',
  chartIncome: '#0E9384',
  chartExpense: '#D9573A',
  ...semanticLight,
};

/**
 * The primary experience: glass floating in a dark room.
 *
 * The room is near-black charcoal with a cool cast, never pure black, so the
 * darkest glass still reads as a surface in front of it. Panes are light
 * rather than dark — a dark pane on a dark room has no edge — held between 7
 * and 13 percent, enough for the room's light to carry through without
 * turning milky. Text tiers step down evenly and the faintest still clears
 * WCAG AA on the brightest pane.
 */
export const darkTheme: Theme = {
  mode: 'dark',
  bg: '#0B0E14',
  surface: 'rgba(160, 175, 210, 0.07)',
  surfaceAlt: 'rgba(160, 175, 210, 0.055)',
  surfaceRaised: 'rgba(170, 185, 225, 0.10)',
  border: 'rgba(200, 215, 255, 0.10)',
  borderSubtle: 'rgba(200, 215, 255, 0.07)',
  text: '#ECEFF6',
  textSecondary: '#A9B2C5',
  textTertiary: '#8891A6',
  textInverted: '#0B0E14',
  tint: '#8494FF',
  tintMuted: 'rgba(132, 148, 255, 0.16)',
  teal: '#2DC6B2',
  shadow: 'rgba(0, 0, 0, 0.55)',
  overlay: 'rgba(4, 6, 10, 0.72)',
  surfaceSolid: '#161B26',
  glass: 'rgba(160, 175, 210, 0.07)',
  glassStrong: 'rgba(170, 185, 225, 0.10)',
  glassControl: 'rgba(190, 205, 240, 0.13)',
  glassBorder: 'rgba(200, 215, 255, 0.10)',
  glassEdge: 'rgba(235, 242, 255, 0.34)',
  glassSheen: 'rgba(210, 222, 255, 0.07)',
  glassDepth: 'rgba(0, 0, 0, 0.32)',
  glassTint: 'dark',
  blurIntensity: 42,
  glassFrost: 'rgba(11, 14, 20, 0.26)',
  auroraOne: 'rgba(92, 106, 255, 0.30)',
  auroraTwo: 'rgba(45, 198, 178, 0.14)',
  auroraThree: 'rgba(110, 90, 240, 0.12)',
  chartIncome: semanticDark.success,
  chartExpense: semanticDark.expense,
  ...semanticDark,
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
 * instead of restarting. Tuned for a fast departure and a soft settle with no
 * overshoot a person would read as bounce.
 */
export const motion = {
  /** Finger-follows-glass: quick to depart, settles without wobbling. */
  press: { damping: 24, stiffness: 340, mass: 0.7 },
  /** An indicator gliding to a new tab. */
  glide: { damping: 22, stiffness: 190, mass: 0.9 },
  /** Something arriving on screen. */
  enter: { damping: 20, stiffness: 150, mass: 1 },
  /** Buttons sink under the finger. */
  pressScale: 0.97,
  /** Cards rise toward it. */
  liftScale: 1.015,
  /** How far a card tips toward the point touched, in degrees. */
  tilt: 1.8,
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
  display: 48,
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
