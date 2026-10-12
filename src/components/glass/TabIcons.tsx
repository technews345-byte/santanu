import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * Spendly's own tab icons, drawn as two-tone glass: a soft translucent body
 * behind a crisp outline. Selected, the body fills with the accent and the
 * details inside turn white, so the icon reads as lit rather than outlined.
 */
type IconProps = { color: string; active: boolean; size?: number };

function tones(color: string, active: boolean) {
  return {
    body: color,
    bodyOpacity: active ? 1 : 0.16,
    line: color,
    detail: active ? '#FFFFFF' : color,
  };
}

export function HomeIcon({ color, active, size = 24 }: IconProps) {
  const t = tones(color, active);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.6 10.4 12 3.6l8.4 6.8V19a2.2 2.2 0 0 1-2.2 2.2H5.8A2.2 2.2 0 0 1 3.6 19z"
        fill={t.body}
        fillOpacity={t.bodyOpacity}
        stroke={t.line}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M9.5 21.2v-4.6a2.5 2.5 0 0 1 5 0v4.6" stroke={t.detail} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function ActivityIcon({ color, active, size = 24 }: IconProps) {
  const t = tones(color, active);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* A receipt with a torn edge */}
      <Path
        d="M5.2 3h13.6v17.6l-2.27-1.4-2.26 1.4L12 19.2l-2.27 1.4-2.26-1.4-2.27 1.4z"
        fill={t.body}
        fillOpacity={t.bodyOpacity}
        stroke={t.line}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M8.6 8h6.8M8.6 11.6h6.8M8.6 15.2h4" stroke={t.detail} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function BudgetIcon({ color, active, size = 24 }: IconProps) {
  const t = tones(color, active);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M11 4.1A8.6 8.6 0 1 0 19.9 13H11z"
        fill={t.body}
        fillOpacity={t.bodyOpacity}
        stroke={t.line}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      {/* The slice lifted out of the pie */}
      <Path
        d="M14 2.4a8.6 8.6 0 0 1 7.6 7.6H14z"
        fill={active ? t.detail : t.body}
        fillOpacity={active ? 1 : 0.16}
        stroke={active ? t.detail : t.line}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function InsightsIcon({ color, active, size = 24 }: IconProps) {
  const t = tones(color, active);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3.4} y={12.6} width={4.4} height={8} rx={1.6} fill={t.body} fillOpacity={t.bodyOpacity} stroke={t.line} strokeWidth={1.8} />
      <Rect x={9.8} y={8.4} width={4.4} height={12.2} rx={1.6} fill={t.body} fillOpacity={t.bodyOpacity} stroke={t.line} strokeWidth={1.8} />
      <Rect x={16.2} y={3.6} width={4.4} height={17} rx={1.6} fill={t.body} fillOpacity={t.bodyOpacity} stroke={t.line} strokeWidth={1.8} />
      {active && <Path d="M5.6 16.4h0M12 12.6h0M18.4 8h0" stroke={t.detail} strokeWidth={2.4} strokeLinecap="round" />}
    </Svg>
  );
}

export function SettingsIcon({ color, active, size = 24 }: IconProps) {
  const t = tones(color, active);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2.8l1.9 1.6 2.5-.3 1 2.3 2.3 1-.3 2.5 1.6 1.9-1.6 1.9.3 2.5-2.3 1-1 2.3-2.5-.3L12 21.2l-1.9-1.6-2.5.3-1-2.3-2.3-1 .3-2.5L3 12.1l1.6-1.9-.3-2.5 2.3-1 1-2.3 2.5.3z"
        fill={t.body}
        fillOpacity={t.bodyOpacity}
        stroke={t.line}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12} r={3.1} stroke={t.detail} strokeWidth={1.8} />
    </Svg>
  );
}
