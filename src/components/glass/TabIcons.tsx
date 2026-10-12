import React, { useId } from 'react';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * Spendly's tab icons as small rounded objects of 3D glass.
 *
 * Each icon is one soft, rounded shape built in layers, back to front:
 *
 *  1. its base, a darker copy just below it — the object's thickness
 *  2. the body, lit from above: lighter at the top, deeper at the bottom
 *  3. gloss: white falling off down the top half of each part
 *  4. a hairline rim of light along the upper edge
 *  5. the details (door, lines, slice, hub), set on their own shadow so they
 *     read as raised from the body
 *
 * All of it is flat fills and gradients — no filters or masks, which phones
 * draw slowly — and a tab bar only redraws an icon when its tab changes.
 */
export type GlassIconPalette = {
  top: string;
  bottom: string;
  base: string;
  detail: string;
  detailShadow: string;
  gloss: number;
};

type IconProps = { palette: GlassIconPalette; size?: number };
type Part = (props: Record<string, unknown>) => React.ReactElement;

function Glass3D({ palette, size = 26, body, details }: IconProps & { body: Part; details?: Part }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <Defs>
        <LinearGradient id={`${uid}b`} x1="0" y1="0" x2="0.3" y2="1">
          <Stop offset="0" stopColor={palette.top} />
          <Stop offset="1" stopColor={palette.bottom} />
        </LinearGradient>
        <LinearGradient id={`${uid}g`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={palette.gloss} />
          <Stop offset="0.48" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id={`${uid}r`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.85} />
          <Stop offset="0.4" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <G transform="translate(0 1.5)">{body({ fill: palette.base })}</G>
      {body({ fill: `url(#${uid}b)` })}
      {body({ fill: `url(#${uid}g)` })}
      {body({ stroke: `url(#${uid}r)`, strokeWidth: 0.9, fill: 'none' })}
      {details && <G transform="translate(0 0.9)">{details({ fill: palette.detailShadow })}</G>}
      {details && details({ fill: palette.detail })}
    </Svg>
  );
}

const HOUSE =
  'M4.6 13.4c0-1 .45-1.95 1.22-2.58l6.4-5.24a2.8 2.8 0 0 1 3.56 0l6.4 5.24c.77.63 1.22 1.58 1.22 2.58v7.8a3.4 3.4 0 0 1-3.4 3.4H8a3.4 3.4 0 0 1-3.4-3.4z';

export function HomeIcon(p: IconProps) {
  return (
    <Glass3D
      {...p}
      body={(s) => <Path d={HOUSE} {...s} />}
      details={(s) => <Rect x={11.3} y={16.2} width={5.4} height={8.4} rx={2.7} {...s} />}
    />
  );
}

export function ActivityIcon(p: IconProps) {
  return (
    <Glass3D
      {...p}
      body={(s) => <Rect x={5.4} y={3.6} width={17.2} height={21.4} rx={5} {...s} />}
      details={(s) => (
        <G {...s}>
          <Rect x={9.2} y={9} width={9.6} height={2.4} rx={1.2} />
          <Rect x={9.2} y={13.4} width={9.6} height={2.4} rx={1.2} />
          <Rect x={9.2} y={17.8} width={5.8} height={2.4} rx={1.2} />
        </G>
      )}
    />
  );
}

export function BudgetIcon(p: IconProps) {
  return (
    <Glass3D
      {...p}
      body={(s) => <Path d="M12.6 5a9.6 9.6 0 1 0 10.4 10.4h-8.4a2 2 0 0 1-2-2z" {...s} />}
      details={(s) => <Path d="M16.2 3.2a9.2 9.2 0 0 1 8.6 8.6c.04.7-.52 1.2-1.2 1.2h-6.2a2 2 0 0 1-2-2V4.4c0-.68.52-1.24 1.2-1.2z" {...s} />}
    />
  );
}

export function InsightsIcon(p: IconProps) {
  return (
    <Glass3D
      {...p}
      body={(s) => (
        <G {...s}>
          <Rect x={4.2} y={13.6} width={5.6} height={11} rx={2.8} />
          <Rect x={11.2} y={8.6} width={5.6} height={16} rx={2.8} />
          <Rect x={18.2} y={3.6} width={5.6} height={21} rx={2.8} />
        </G>
      )}
    />
  );
}

// A gear with soft, rounded teeth: a circle whose radius swells eight times
// around, so every tooth is a smooth lobe rather than a sharp notch.
const GEAR = (() => {
  const steps = 144;
  const points: string[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = 9.3 + 1.5 * Math.max(-0.55, Math.min(0.85, Math.cos(8 * a) * 1.15));
    points.push(`${(14 + r * Math.cos(a)).toFixed(2)} ${(14 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${points.join('L')}Z`;
})();

export function SettingsIcon(p: IconProps) {
  return (
    <Glass3D
      {...p}
      body={(s) => <Path d={GEAR} {...s} />}
      details={(s) => <Circle cx={14} cy={14} r={3.8} {...s} />}
    />
  );
}
