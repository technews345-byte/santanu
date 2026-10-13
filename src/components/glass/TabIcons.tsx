import React, { useId } from 'react';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * Spendly's tab icons, after the round icons of iOS 27: a clean circle with a
 * soft top-to-bottom gradient, a thin rim of light around the top, and a
 * large, crisp symbol. No heavy gloss or bevel — the colour does the work.
 */
export const ORB_SIZE = 44;

export function Orb({ gradient }: { gradient: string[] }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <Svg width={ORB_SIZE} height={ORB_SIZE} viewBox="0 0 44 44">
      <Defs>
        <LinearGradient id={`${uid}b`} x1="0" y1="0" x2="0" y2="1">
          {gradient.map((c, i) => (
            <Stop key={i} offset={i / Math.max(1, gradient.length - 1)} stopColor={c} />
          ))}
        </LinearGradient>
        <LinearGradient id={`${uid}r`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.55} />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Circle cx={22} cy={22} r={22} fill={`url(#${uid}b)`} />
      <Circle cx={22} cy={22} r={21.4} stroke={`url(#${uid}r)`} strokeWidth={1.2} fill="none" />
      {/* A faint edge, so a white icon still reads against light glass */}
      <Circle cx={22} cy={22} r={21.6} stroke="rgba(0, 0, 0, 0.1)" strokeWidth={0.8} fill="none" />
    </Svg>
  );
}

/** Symbols are drawn in a 24-unit box and shown at this size, centred on the orb. */
export const GLYPH_SIZE = 26;

type GlyphProps = { color?: string; hole?: string };

export function HomeGlyph({ color = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M12.9 3.6a1.4 1.4 0 0 0-1.8 0L3.6 9.9c-.8.7-.3 2 .8 2H5.6v7.3c0 .9.7 1.6 1.6 1.6h2.9v-4.6c0-.7.6-1.3 1.3-1.3h1.2c.7 0 1.3.6 1.3 1.3v4.6h2.9c.9 0 1.6-.7 1.6-1.6v-7.3h1.2c1.1 0 1.6-1.3.8-2z"
      />
    </Svg>
  );
}

/** A list in the manner of iOS Reminders: coloured dots and grey lines. */
export function ActivityGlyph(_: GlyphProps) {
  return (
    <Svg width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox="0 0 24 24">
      <Circle fill="#0A84FF" cx={5.2} cy={6.4} r={2.1} />
      <Circle fill="#FF3B30" cx={5.2} cy={12} r={2.1} />
      <Circle fill="#FF9500" cx={5.2} cy={17.6} r={2.1} />
      <Rect fill="#C3C9D4" x={9.4} y={5.6} width={11} height={1.6} rx={0.8} />
      <Rect fill="#C3C9D4" x={9.4} y={11.2} width={11} height={1.6} rx={0.8} />
      <Rect fill="#C3C9D4" x={9.4} y={16.8} width={11} height={1.6} rx={0.8} />
    </Svg>
  );
}

export function BudgetGlyph({ color = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox="0 0 24 24">
      <Path fill={color} opacity={0.8} d="M10.8 4.4a8.2 8.2 0 1 0 9 9.4h-7.6c-.8 0-1.4-.6-1.4-1.4z" />
      <Path fill={color} d="M13.4 2.6a8.4 8.4 0 0 1 8 8c0 .5-.4.9-.9.9h-6.6c-.5 0-.9-.4-.9-.9V3.5c0-.5.4-.9.9-.9z" />
    </Svg>
  );
}

export function InsightsGlyph({ color = '#FFFFFF' }: GlyphProps) {
  return (
    <Svg width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox="0 0 24 24">
      <Rect fill={color} x={4.4} y={13} width={4} height={7.4} rx={2} />
      <Rect fill={color} x={10} y={8.6} width={4} height={11.8} rx={2} />
      <Rect fill={color} x={15.6} y={4} width={4} height={16.4} rx={2} />
    </Svg>
  );
}

// A gear with soft, rounded teeth: a circle whose radius swells eight times
// around, so every tooth is a smooth lobe.
const GEAR = (() => {
  const steps = 144;
  const points: string[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = 7.6 + 1.5 * Math.max(-0.55, Math.min(0.85, Math.cos(8 * a) * 1.15));
    points.push(`${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${points.join('L')}Z`;
})();

export function SettingsGlyph({ color = '#F4F5F7', hole = '#8A909B' }: GlyphProps) {
  return (
    <Svg width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox="0 0 24 24">
      <Path fill={color} d={GEAR} />
      <Circle fill={hole} cx={12} cy={12} r={3.1} />
    </Svg>
  );
}
