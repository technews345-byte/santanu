import React, { useId } from 'react';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * Spendly's tab icons, in the manner of Apple's 3D app icons: a perfect
 * circle of glossy gradient glass with a white symbol.
 *
 * Built in layers, back to front: a soft outer shadow beneath; the body, its
 * gradient running from the upper left; an inner shadow gathering toward the
 * rim; a bevel of light just inside the edge; a glossy reflection over the
 * top; light refracted back up inside the lower edge; and a fine outer edge.
 * The symbol is a separate layer on top.
 *
 * Flat fills and gradients only — no filters or masks, which phones draw
 * slowly — and an icon redraws only when its tab changes.
 */
export const ORB_SIZE = 44;
/** The drawing extends this far past the orb on every side, for its shadow. */
const BLEED = 6;

export function Orb({ gradient }: { gradient: string[] }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const stops = gradient.length > 1 ? gradient : [gradient[0], gradient[0]];
  const canvas = ORB_SIZE + BLEED * 2;
  return (
    <Svg
      width={canvas}
      height={canvas}
      viewBox={`${-BLEED} ${-BLEED} ${canvas} ${canvas}`}
      style={{ margin: -BLEED }}
    >
      <Defs>
        <LinearGradient id={`${uid}b`} x1="0.15" y1="0" x2="0.85" y2="1">
          {stops.map((c, i) => (
            <Stop key={i} offset={i / (stops.length - 1)} stopColor={c} />
          ))}
        </LinearGradient>
        <RadialGradient id={`${uid}s`} cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0.72" stopColor="#000000" stopOpacity={0.25} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${uid}i`} cx="50%" cy="40%" rx="62%" ry="62%">
          <Stop offset="0.68" stopColor="#000000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.3} />
        </RadialGradient>
        <LinearGradient id={`${uid}v`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.6} />
          <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.28} />
        </LinearGradient>
        <LinearGradient id={`${uid}g`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.65} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
        <RadialGradient id={`${uid}r`} cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.32} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {/* Outer shadow */}
      <Ellipse cx={22} cy={25.5} rx={25} ry={24} fill={`url(#${uid}s)`} />
      {/* Body */}
      <Circle cx={22} cy={22} r={22} fill={`url(#${uid}b)`} />
      {/* Inner shadow toward the rim */}
      <Circle cx={22} cy={22} r={22} fill={`url(#${uid}i)`} />
      {/* Light refracted back up inside the lower edge */}
      <Ellipse cx={22} cy={36.5} rx={12} ry={4.2} fill={`url(#${uid}r)`} />
      {/* Bevel just inside the edge */}
      <Circle cx={22} cy={22} r={20.6} stroke={`url(#${uid}v)`} strokeWidth={1.2} fill="none" />
      {/* Glossy top reflection */}
      <Ellipse cx={22} cy={11.6} rx={15} ry={8.4} fill={`url(#${uid}g)`} />
      {/* Fine outer edge */}
      <Circle cx={22} cy={22} r={21.5} stroke="rgba(255, 255, 255, 0.3)" strokeWidth={1} fill="none" />
    </Svg>
  );
}

/** Symbols are drawn in a 24-unit box and shown at this size, centred on the orb. */
export const GLYPH_SIZE = 23;

type GlyphProps = { color?: string; hole?: string };

function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <Svg width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox="0 0 24 24">
      {/* A faint shadow under the symbol lifts it off the glass */}
      <G transform="translate(0 0.8)" opacity={0.22}>
        {React.Children.map(children, (child) =>
          React.isValidElement(child) ? React.cloneElement(child as React.ReactElement<any>, { fill: '#000000' }) : child
        )}
      </G>
      {children}
    </Svg>
  );
}

/** house.fill */
export function HomeGlyph({ color = '#FFFFFF' }: GlyphProps) {
  return (
    <Glyph>
      <Path
        fill={color}
        d="M12.9 3.6a1.4 1.4 0 0 0-1.8 0L3.6 9.9c-.8.7-.3 2 .8 2H5.6v7.3c0 .9.7 1.6 1.6 1.6h2.9v-4.6c0-.7.6-1.3 1.3-1.3h1.2c.7 0 1.3.6 1.3 1.3v4.6h2.9c.9 0 1.6-.7 1.6-1.6v-7.3h1.2c1.1 0 1.6-1.3.8-2z"
      />
    </Glyph>
  );
}

/** list.bullet */
export function ActivityGlyph({ color = '#FFFFFF' }: GlyphProps) {
  return (
    <Glyph>
      <Circle fill={color} cx={5.4} cy={6.6} r={1.7} />
      <Circle fill={color} cx={5.4} cy={12} r={1.7} />
      <Circle fill={color} cx={5.4} cy={17.4} r={1.7} />
      <Rect fill={color} x={9.2} y={5.3} width={10.6} height={2.6} rx={1.3} />
      <Rect fill={color} x={9.2} y={10.7} width={10.6} height={2.6} rx={1.3} />
      <Rect fill={color} x={9.2} y={16.1} width={10.6} height={2.6} rx={1.3} />
    </Glyph>
  );
}

/** chart.pie.fill */
export function BudgetGlyph({ color = '#FFFFFF' }: GlyphProps) {
  return (
    <Glyph>
      <Path fill={color} opacity={0.82} d="M10.8 4.4a8.2 8.2 0 1 0 9 9.4h-7.6c-.8 0-1.4-.6-1.4-1.4z" />
      <Path fill={color} d="M13.4 2.6a8.4 8.4 0 0 1 8 8c0 .5-.4.9-.9.9h-6.6c-.5 0-.9-.4-.9-.9V3.5c0-.5.4-.9.9-.9z" />
    </Glyph>
  );
}

/** chart.bar.fill */
export function InsightsGlyph({ color = '#FFFFFF' }: GlyphProps) {
  return (
    <Glyph>
      <Rect fill={color} x={4.4} y={13} width={4} height={7.4} rx={2} />
      <Rect fill={color} x={10} y={8.6} width={4} height={11.8} rx={2} />
      <Rect fill={color} x={15.6} y={4} width={4} height={16.4} rx={2} />
    </Glyph>
  );
}

// gearshape.fill: a gear with soft, rounded teeth — a circle whose radius
// swells eight times around, so every tooth is a smooth lobe.
const GEAR = (() => {
  const steps = 144;
  const points: string[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = 7.4 + 1.4 * Math.max(-0.55, Math.min(0.85, Math.cos(8 * a) * 1.15));
    points.push(`${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${points.join('L')}Z`;
})();

export function SettingsGlyph({ color = '#FFFFFF', hole = '#273247' }: GlyphProps) {
  return (
    <Svg width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox="0 0 24 24">
      <G transform="translate(0 0.8)" opacity={0.22}>
        <Path fill="#000000" d={GEAR} />
      </G>
      <Path fill={color} d={GEAR} />
      <Circle fill={hole} cx={12} cy={12} r={3} />
    </Svg>
  );
}
