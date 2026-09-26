import React, { useId } from 'react';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import { rotateHue, shade } from '../theme/color';

/**
 * Spendly's category icons: small physical objects of frosted glass.
 *
 * Every icon is built the same way, from at most four things:
 *
 *  - an object of vivid, lit colour behind (a glow, a coin, a note, a card),
 *  - a pane of frosted glass in front, cut to the category's silhouette,
 *  - a bold white glyph on the glass that says what the category is,
 *  - now and then a small bead of a neighbouring colour.
 *
 * Where the glass covers the object, the object is only ever seen blurred —
 * it is removed from under the pane and drawn again diffused inside it — so
 * the glass reads as frosted rather than as a tinted window. Outside the
 * pane the object stays crisp and throws a faint bloom of its own colour.
 *
 * One light for all of them: from the upper-left, catching the pane's rim
 * brightest there and fading round to the lower-right.
 *
 * The silhouette and the glyph carry the meaning on their own, so an icon
 * still reads at 24 px with the glass and glow gone: bold shapes, strokes no
 * thinner than two units in forty-eight, and never more than four parts.
 *
 * Colour comes from the category, so an icon always matches its category's
 * slice in a chart; each design turns the hue a set distance for its second
 * colour, which is what gives the set its pairings — coral into pink, blue
 * into violet, lime into cyan.
 */

type Shape =
  | { kind: 'path'; d: string }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; r: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number };

type BackShape = Shape & { paint?: 'body' | 'bead' };

type Design = {
  /** The coloured object behind the glass. */
  back: BackShape[];
  /** The pane of glass, as one or more non-overlapping shapes. */
  glass: Shape[];
  /** The glyph on the glass, drawn in `ink`. */
  glyph: (ink: string) => React.ReactNode;
  /** Degrees to turn the category's hue for the object's second colour. */
  turn: number;
  /** Degrees to turn it for the bead. */
  beadTurn?: number;
};

const stroke = (ink: string, width = 2.4) => ({
  stroke: ink,
  strokeWidth: width,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
});

const DESIGNS: Record<string, Design> = {
  // A plate, fork and spoon laid on it; a warm glow rising behind.
  food: {
    turn: -28,
    beadTurn: 40,
    back: [
      { kind: 'circle', cx: 30.5, cy: 17.5, r: 11 },
      { kind: 'circle', cx: 8, cy: 38, r: 2.6, paint: 'bead' },
    ],
    glass: [{ kind: 'circle', cx: 22, cy: 27, r: 15 }],
    glyph: (ink) => (
      <>
        <Circle cx={22} cy={27} r={10} {...stroke(ink, 1.4)} opacity={0.55} />
        <Path d="M17.5 21v4.5M20.5 21v4.5M17.5 25.5q1.5 2 3 0M19 26.5v7.5" {...stroke(ink, 1.9)} />
        <Ellipse cx={25.5} cy={23.4} rx={2.3} ry={3} fill={ink} />
        <Path d="M25.5 26.4v7.6" {...stroke(ink, 1.9)} />
      </>
    ),
  },

  // A basket, fresh produce heaped behind it.
  groceries: {
    turn: 70,
    back: [
      { kind: 'circle', cx: 29.5, cy: 18, r: 9.5 },
      { kind: 'circle', cx: 18, cy: 17.5, r: 6, paint: 'bead' },
    ],
    glass: [{ kind: 'path', d: 'M7.5 22.5h33a1.5 1.5 0 0 1 1.45 1.9l-3.9 14.3a4 4 0 0 1-3.86 2.95H13.8a4 4 0 0 1-3.86-2.95L6.05 24.4A1.5 1.5 0 0 1 7.5 22.5z' }],
    glyph: (ink) => <Path d="M17 28v8M24 28v8M31 28v8" {...stroke(ink)} />,
  },

  // A compact car, a blue light behind.
  transport: {
    turn: 42,
    beadTurn: -150,
    back: [
      { kind: 'circle', cx: 31, cy: 18.5, r: 10 },
      { kind: 'circle', cx: 9, cy: 17, r: 2.6, paint: 'bead' },
    ],
    glass: [{ kind: 'path', d: 'M6 31.5c0-3 2-5 4.6-5.6l3.6-6.9A5 5 0 0 1 18.7 16h10.6a5 5 0 0 1 4.5 3l3.6 6.9c2.6.6 4.6 2.6 4.6 5.6V36a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z' }],
    glyph: (ink) => (
      <>
        <Path d="M15.5 25.5l2.6-5h11.8l2.6 5z" {...stroke(ink, 1.9)} />
        <Circle cx={15} cy={38} r={3.6} fill={ink} />
        <Circle cx={33} cy={38} r={3.6} fill={ink} />
      </>
    ),
  },

  // A fuel pump, a drop of fuel lit behind it.
  fuel: {
    turn: -32,
    beadTurn: 170,
    back: [
      { kind: 'path', d: 'M30.5 7c4.2 5 7 9 7 12.8a7 7 0 0 1-14 0c0-3.8 2.8-7.8 7-12.8z' },
      { kind: 'circle', cx: 7, cy: 12, r: 2.6, paint: 'bead' },
    ],
    glass: [{ kind: 'rect', x: 8, y: 12, w: 20, h: 29, r: 4.5 }],
    glyph: (ink) => (
      <>
        <Rect x={12.5} y={16.5} width={11} height={7.5} rx={1.8} {...stroke(ink, 2)} />
        <Path d="M28 22h3a3 3 0 0 1 3 3v9a2.5 2.5 0 0 0 5 0V27" {...stroke(ink, 2.2)} />
        <Path d="M13 34h10" {...stroke(ink)} />
      </>
    ),
  },

  // A shopping bag, a second bag behind it in a cooler colour.
  shopping: {
    turn: -45,
    beadTurn: -110,
    back: [
      { kind: 'rect', x: 21, y: 10, w: 19, h: 22, r: 4.5 },
      { kind: 'circle', cx: 8, cy: 14, r: 2.6, paint: 'bead' },
    ],
    glass: [{ kind: 'path', d: 'M11.5 18h18a3 3 0 0 1 3 2.8l1.2 16a4 4 0 0 1-4 4.2H11.3a4 4 0 0 1-4-4.2l1.2-16a3 3 0 0 1 3-2.8z' }],
    glyph: (ink) => <Path d="M15 22v-4.5a5.5 5.5 0 0 1 11 0V22" {...stroke(ink)} />,
  },

  // A bill, a bolt of lightning behind it.
  utilities: {
    turn: -40,
    back: [{ kind: 'path', d: 'M33 5L22.5 25H30l-3.5 17L41 19.5h-8L37.5 5z' }],
    glass: [{ kind: 'rect', x: 7, y: 9, w: 23, h: 31, r: 4.5 }],
    glyph: (ink) => <Path d="M12.5 17h12M12.5 23h12M12.5 29h7" {...stroke(ink)} />,
  },

  // A screen with a play button, a magenta light behind.
  entertainment: {
    turn: -40,
    beadTurn: 120,
    back: [
      { kind: 'circle', cx: 29.5, cy: 18.5, r: 11 },
      { kind: 'circle', cx: 40, cy: 38, r: 2.6, paint: 'bead' },
    ],
    glass: [{ kind: 'rect', x: 6, y: 14, w: 31, h: 25, r: 7 }],
    glyph: (ink) => <Path d="M18.5 20.5l9.5 6-9.5 6z" fill={ink} stroke={ink} strokeWidth={2} strokeLinejoin="round" />,
  },

  // A suitcase, a location pin rising behind it.
  travel: {
    turn: 60,
    back: [
      { kind: 'path', d: 'M35 5.5a7.5 7.5 0 0 1 7.5 7.5c0 5.4-7.5 13-7.5 13s-7.5-7.6-7.5-13A7.5 7.5 0 0 1 35 5.5z' },
      { kind: 'circle', cx: 8, cy: 12, r: 2.6, paint: 'bead' },
    ],
    glass: [{ kind: 'rect', x: 6, y: 18, w: 29, h: 22, r: 5 }],
    glyph: (ink) => (
      <>
        <Path d="M15 18v-3.5a2.5 2.5 0 0 1 2.5-2.5h6a2.5 2.5 0 0 1 2.5 2.5V18" {...stroke(ink)} />
        <Path d="M13.5 23v12M27.5 23v12" {...stroke(ink)} />
      </>
    ),
  },

  // A rounded medical cross, a heart behind it.
  health: {
    turn: 170,
    beadTurn: 170,
    back: [
      { kind: 'path', d: 'M34.5 24C27 18.8 25.8 13.8 28.8 11.1c2.1-1.9 4.5-1.2 5.7.9 1.2-2.1 3.6-2.8 5.7-.9 3 2.7 1.8 7.7-5.7 12.9z', paint: 'body' },
      { kind: 'circle', cx: 7, cy: 13, r: 2.6, paint: 'bead' },
    ],
    glass: [{ kind: 'path', d: 'M20 14h4a3 3 0 0 1 3 3v6h6a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-6v6a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3v-6h-6a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3h6v-6a3 3 0 0 1 3-3z' }],
    glyph: (ink) => <Path d="M22 22.5v11M16.5 28h11" {...stroke(ink, 2.2)} opacity={0.9} />,
  },

  // An open book, its pages lit from behind.
  education: {
    turn: 40,
    beadTurn: -140,
    back: [
      { kind: 'circle', cx: 30, cy: 17, r: 10 },
      { kind: 'circle', cx: 7, cy: 40, r: 2.6, paint: 'bead' },
    ],
    glass: [{ kind: 'path', d: 'M24 16.5c-4.8-3-10.4-3.4-16-2.3v24.3c5.6-1.1 11.2-.6 16 2.3 4.8-2.9 10.4-3.4 16-2.3V14.2c-5.6-1.1-11.2-.7-16 2.3z' }],
    glyph: (ink) => (
      <>
        <Path d="M24 17v22" {...stroke(ink, 1.9)} />
        <Path d="M12 22.5q4.5-.9 8.5 1M12 28.5q4.5-.9 8.5 1M27.5 23.5q4-1.9 8.5-1M27.5 29.5q4-1.9 8.5-1" {...stroke(ink, 1.9)} />
      </>
    ),
  },

  // A house with a warm light inside.
  home: {
    turn: 180,
    back: [
      { kind: 'circle', cx: 24, cy: 31, r: 8 },
      { kind: 'circle', cx: 36, cy: 11, r: 6.5, paint: 'bead' },
    ],
    glass: [{ kind: 'path', d: 'M22 10.3a3 3 0 0 1 4 0l13 11.2a3 3 0 0 1 1 2.3V38a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V23.8a3 3 0 0 1 1-2.3z' }],
    glyph: (ink) => <Path d="M20 41v-7a4 4 0 0 1 8 0v7" {...stroke(ink)} />,
  },

  // A hand mirror, a soft glow behind it.
  care: {
    turn: 45,
    beadTurn: -120,
    back: [
      { kind: 'circle', cx: 29, cy: 16, r: 9 },
      { kind: 'circle', cx: 38, cy: 36, r: 2.6, paint: 'bead' },
    ],
    glass: [
      { kind: 'ellipse', cx: 20, cy: 20, rx: 12, ry: 13 },
      { kind: 'rect', x: 17, y: 34, w: 6, h: 9, r: 3 },
    ],
    glyph: (ink) => <Path d="M14 15.5q2.5-3.5 6.5-3.8" {...stroke(ink, 2.2)} />,
  },

  // Recurring arrows on a glass disc, a card behind.
  subscriptions: {
    turn: 50,
    beadTurn: -130,
    back: [
      { kind: 'rect', x: 18, y: 9, w: 24, h: 17, r: 4 },
      { kind: 'circle', cx: 7, cy: 16, r: 2.6, paint: 'bead' },
    ],
    glass: [{ kind: 'circle', cx: 21, cy: 29, r: 13.5 }],
    glyph: (ink) => (
      <>
        <Path d="M14.2 30.6A7 7 0 0 1 26.4 24.5M27.8 27.4A7 7 0 0 1 15.6 33.5" {...stroke(ink, 2.2)} />
        <Path d="M27.3 20.6l-.9 3.9-3.9-.8M14.7 37.4l.9-3.9 3.9.8" {...stroke(ink, 2.2)} />
      </>
    ),
  },

  // A glass panel with a rising line, bars climbing behind it.
  investments: {
    turn: 35,
    beadTurn: -150,
    back: [
      { kind: 'rect', x: 27, y: 13, w: 6.5, h: 18, r: 3.25 },
      { kind: 'rect', x: 36, y: 6, w: 6.5, h: 25, r: 3.25 },
      { kind: 'circle', cx: 7, cy: 12, r: 2.6, paint: 'bead' },
    ],
    glass: [{ kind: 'rect', x: 6, y: 17, w: 30, h: 25, r: 6 }],
    glyph: (ink) => <Path d="M11.5 35.5l6-6 4.5 3.5 8-9M25.5 24h4.5v4.5" {...stroke(ink)} />,
  },

  // A wallet, a banknote standing up behind it.
  wallet: {
    turn: 40,
    beadTurn: 160,
    back: [{ kind: 'rect', x: 13, y: 8, w: 26, h: 19, r: 3.5 }],
    glass: [{ kind: 'rect', x: 6, y: 17, w: 35, h: 24, r: 6 }],
    glyph: (ink) => (
      <>
        <Path d="M41 25.5h-8a3.5 3.5 0 0 0 0 7h8" {...stroke(ink, 2.2)} />
        <Circle cx={33.5} cy={29} r={1.7} fill={ink} />
      </>
    ),
  },

  // A glass card, a second card behind it.
  card: {
    turn: -40,
    beadTurn: 60,
    back: [{ kind: 'rect', x: 14, y: 9, w: 29, h: 20, r: 4 }],
    glass: [{ kind: 'rect', x: 4, y: 18, w: 31, h: 21, r: 4.5 }],
    glyph: (ink) => (
      <>
        <Path d="M4.5 24.5h30" {...stroke(ink, 2.6)} opacity={0.75} />
        <Rect x={9} y={30} width={7} height={4.6} rx={1.3} fill={ink} />
        <Path d="M20 32.3h9" {...stroke(ink, 2)} opacity={0.8} />
      </>
    ),
  },

  // A bank: a pediment and base in glass, columns between, a coin behind.
  bank: {
    turn: 40,
    back: [
      { kind: 'circle', cx: 33, cy: 14, r: 8 },
      { kind: 'circle', cx: 7, cy: 32, r: 2.6, paint: 'bead' },
    ],
    glass: [
      { kind: 'path', d: 'M22.6 7.8a3 3 0 0 1 2.8 0l14.2 7.6a1.9 1.9 0 0 1-.9 3.6H9.3a1.9 1.9 0 0 1-.9-3.6z' },
      { kind: 'rect', x: 7, y: 35, w: 34, h: 6, r: 2.2 },
    ],
    glyph: (ink) => <Path d="M13 23v8M20.3 23v8M27.7 23v8M35 23v8" {...stroke(ink, 2.8)} />,
  },

  // A shield with a check, a light behind it.
  shield: {
    turn: 45,
    beadTurn: 150,
    back: [
      { kind: 'circle', cx: 30.5, cy: 17, r: 9.5 },
      { kind: 'circle', cx: 40, cy: 37, r: 2.6, paint: 'bead' },
    ],
    glass: [{ kind: 'path', d: 'M20.8 8.4a3.5 3.5 0 0 1 2.4 0l10.5 3.8a2 2 0 0 1 1.3 1.9V24c0 8.4-5.6 13.8-12.3 17.4a1.6 1.6 0 0 1-1.4 0C14.6 37.8 9 32.4 9 24v-9.9a2 2 0 0 1 1.3-1.9z' }],
    glyph: (ink) => <Path d="M16.5 25l4 4 7.5-8" {...stroke(ink)} />,
  },

  // A glass orb holding three dots, a smaller orb behind.
  other: {
    turn: 60,
    back: [{ kind: 'circle', cx: 31.5, cy: 16.5, r: 9 }],
    glass: [{ kind: 'circle', cx: 22, cy: 27, r: 15 }],
    glyph: (ink) => (
      <>
        <Circle cx={16} cy={27} r={2.4} fill={ink} />
        <Circle cx={22} cy={27} r={2.4} fill={ink} />
        <Circle cx={28} cy={27} r={2.4} fill={ink} />
      </>
    ),
  },
};

/** Which design draws a given glyph name. */
const BY_ICON: Record<string, keyof typeof DESIGNS> = {
  restaurant: 'food',
  cart: 'groceries',
  car: 'transport',
  flame: 'fuel',
  bag: 'shopping',
  flash: 'utilities',
  film: 'entertainment',
  airplane: 'travel',
  heart: 'health',
  medkit: 'health',
  school: 'education',
  book: 'education',
  home: 'home',
  sparkles: 'care',
  repeat: 'subscriptions',
  'trending-up': 'investments',
  'bar-chart': 'investments',
  cash: 'wallet',
  wallet: 'wallet',
  card: 'card',
  business: 'bank',
  'shield-checkmark': 'shield',
  'ellipsis-horizontal': 'other',
};

export function hasGlassIcon(icon: string): boolean {
  return icon.replace(/-outline$|-sharp$/, '') in BY_ICON;
}

function draw(shape: Shape, props: Record<string, unknown>, key?: React.Key) {
  switch (shape.kind) {
    case 'path':
      return <Path key={key} d={shape.d} {...props} />;
    case 'rect':
      return <Rect key={key} x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.r} {...props} />;
    case 'circle':
      return <Circle key={key} cx={shape.cx} cy={shape.cy} r={shape.r} {...props} />;
    case 'ellipse':
      return <Ellipse key={key} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...props} />;
  }
}

export const GlassIcon = React.memo(function GlassIcon({
  icon,
  color,
  size = 40,
  dark = true,
}: {
  icon: string;
  color: string;
  size?: number;
  dark?: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const design = DESIGNS[BY_ICON[icon.replace(/-outline$|-sharp$/, '')] ?? 'other'];

  const second = rotateHue(color, design.turn);
  const bead = rotateHue(color, design.beadTurn ?? 150);
  const ink = dark ? '#FFFFFF' : shade(color, -0.42);
  const veil = dark ? '#161B26' : '#F4F6FB';

  const body = `url(#${uid}b)`;
  const beadFill = `url(#${uid}d)`;
  const paintFor = (s: BackShape) => (s.paint === 'bead' ? beadFill : body);
  // The object's shapes; with a spread, each also grows outward by half of
  // it in its own paint, which is how glow and diffusion are drawn cheaply.
  const back = (spread = 0) =>
    design.back.map((s, i) =>
      draw(
        s,
        spread
          ? { fill: paintFor(s), stroke: paintFor(s), strokeWidth: spread, strokeLinejoin: 'round' }
          : { fill: paintFor(s) },
        i
      )
    );

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        {/* The object: lit at the upper-left, turning into its second
            colour toward the lower-right. */}
        <LinearGradient id={`${uid}b`} x1="0.1" y1="0" x2="0.9" y2="1">
          <Stop offset="0" stopColor={shade(color, 0.3)} />
          <Stop offset="0.45" stopColor={color} />
          <Stop offset="1" stopColor={second} />
        </LinearGradient>
        <LinearGradient id={`${uid}d`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={shade(bead, 0.35)} />
          <Stop offset="1" stopColor={bead} />
        </LinearGradient>
        {/* The glass: milky where the light lands, clearer away from it. */}
        <LinearGradient id={`${uid}g`} x1="0" y1="0" x2="0.85" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={dark ? 0.3 : 0.72} />
          <Stop offset="1" stopColor={color} stopOpacity={dark ? 0.2 : 0.16} />
        </LinearGradient>
        {/* Its rim: brightest toward the light. */}
        <LinearGradient id={`${uid}r`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={dark ? 0.9 : 1} />
          <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity={dark ? 0.28 : 0.7} />
          <Stop offset="1" stopColor={dark ? '#FFFFFF' : shade(color, -0.2)} stopOpacity={dark ? 0.12 : 0.35} />
        </LinearGradient>
        <ClipPath id={`${uid}c`}>{design.glass.map((s, i) => draw(s, {}, i))}</ClipPath>
      </Defs>

      {/* Bloom: the object's colour spilling softly into the room, as two
          faint halos rather than a blur filter — Android draws SVG filters on
          the CPU, into a bitmap, every time an icon is drawn. */}
      <G opacity={dark ? 0.06 : 0.04}>{back(10)}</G>
      <G opacity={dark ? 0.08 : 0.05}>{back(6.5)}</G>
      <G opacity={dark ? 0.1 : 0.06}>{back(3)}</G>
      {/* The object, crisp where nothing covers it. */}
      {back()}
      {/* Frosted glass hides the sharp outline of what is behind it: a veil
          of the glass's own body first, then the object's colour again,
          spread soft, inside the pane only. */}
      {design.glass.map((s, i) => draw(s, { fill: veil, fillOpacity: dark ? 0.8 : 0.82 }, `v${i}`))}
      <G clipPath={`url(#${uid}c)`}>
        <G opacity={0.09}>{back(11)}</G>
        <G opacity={0.12}>{back(7)}</G>
        <G opacity={0.16}>{back(3.5)}</G>
        <G opacity={0.3}>{back()}</G>
      </G>
      {/* The glass. */}
      {design.glass.map((s, i) =>
        draw(s, { fill: `url(#${uid}g)`, stroke: `url(#${uid}r)`, strokeWidth: 1 }, `g${i}`)
      )}
      {design.glyph(ink)}
    </Svg>
  );
});
