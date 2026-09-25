import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../theme/useReducedMotion';
import { withAlpha } from '../theme/color';
import { fontSizes, radius, spacing } from '../theme/tokens';
import { areaUnder, monotoneCurve, Point } from '../utils/curve';

const PAD_TOP = 10;
const PAD_BOTTOM = 4;
const PAD_X = 6;

/**
 * A line of light drawn through the glass.
 *
 * One series in the accent, optionally a second for comparison in a muted
 * de-emphasis tone, so the eye goes to the current period and uses the other
 * only as a reference. The accent line is 2px with a faint wider stroke under
 * it for glow, a wash below at roughly a tenth of its strength, and draws
 * itself on from the left. No gridlines: a line this simple reads against the
 * glass on its own.
 *
 * Touch it, or drag along it, to read any point: a hairline follows the finger
 * and a small glass label gives the value there. A vertical drag scrolls the
 * page as usual.
 */
export function FlowChart({
  values,
  compare,
  slots,
  height = 110,
  color,
  labelFor,
  format,
  compareLabel = 'Last month',
}: {
  /** The series that matters, left to right. */
  values: number[];
  /** A reference series drawn behind it, muted. */
  compare?: number[];
  /** Positions across the chart; defaults to the longest series. */
  slots?: number;
  height?: number;
  color?: string;
  /** Title for the value at an index, shown while scrubbing. */
  labelFor: (index: number) => string;
  format: (n: number) => string;
  compareLabel?: string;
}) {
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const accent = color ?? theme.tint;
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [width, setWidth] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  // The draw-on is JS-driven either way (dash offsets are SVG attributes), so
  // it runs through state rather than an animated SVG component — which on
  // web would also leak animation props onto the DOM.
  const draw = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const [progress, setProgress] = useState(reduced ? 1 : 0);
  useEffect(() => {
    const listener = draw.addListener(({ value }) => setProgress(value));
    return () => draw.removeListener(listener);
  }, []);

  const n = Math.max(2, slots ?? Math.max(values.length, compare?.length ?? 0));
  const max = Math.max(1, ...values, ...(compare ?? [])) * 1.08;
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const step = width > 0 ? (width - PAD_X * 2) / (n - 1) : 0;

  const toPoints = (series: number[]): Point[] =>
    series.map((v, i) => ({ x: PAD_X + i * step, y: PAD_TOP + plotH - (v / max) * plotH }));

  const main = useMemo(() => (width > 0 ? toPoints(values) : []), [width, values, max, n]);
  const ref = useMemo(() => (width > 0 && compare ? toPoints(compare) : []), [width, compare, max, n]);
  const line = useMemo(() => monotoneCurve(main), [main]);
  const refLine = useMemo(() => monotoneCurve(ref), [ref]);
  const area = useMemo(() => areaUnder(main, PAD_TOP + plotH), [main, plotH]);

  const signature = `${values.join(',')}|${width}`;
  useEffect(() => {
    if (width === 0) return;
    if (reduced) {
      draw.setValue(1);
      setProgress(1);
      return;
    }
    draw.setValue(0);
    Animated.timing(draw, {
      toValue: 1,
      duration: 1100,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      // strokeDashoffset is an SVG attribute, not a transform.
      useNativeDriver: false,
    }).start();
  }, [signature, reduced]);

  const indexAt = (x: number) => {
    if (step === 0 || values.length === 0) return null;
    return Math.max(0, Math.min(values.length - 1, Math.round((x - PAD_X) / step)));
  };

  // The chart takes the touch the moment it lands. A child cannot take a
  // touch from a parent that already owns it, so waiting for a sideways drag
  // (with the card's pressable holding the touch) would never scrub at all.
  // A vertical drag is handed straight back to the page so it still scrolls,
  // and a tap leaves its reading up for a moment before it clears.
  const box = useRef<View>(null);
  const originX = useRef(0);
  const measure = () => box.current?.measureInWindow((x) => (originX.current = x));
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hold = (index: number | null) => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setScrub(index);
  };
  const release = () => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setScrub(null), 1800);
  };
  useEffect(() => () => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
  }, []);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Measured from the chart's own left edge in the window: locationX is
        // relative to whichever element is under the finger, which over a
        // line or a dot is that shape rather than the chart.
        onPanResponderGrant: (_, g) => hold(indexAt(g.x0 - originX.current)),
        onPanResponderMove: (_, g) => hold(indexAt(g.moveX - originX.current)),
        onPanResponderRelease: release,
        onPanResponderTerminate: () => hold(null),
        onPanResponderTerminationRequest: (_, g) => Math.abs(g.dy) > Math.abs(g.dx),
      }),
    [step, values.length]
  );

  const last = main[main.length - 1];
  const probe = scrub !== null ? main[scrub] : null;
  const surface = theme.mode === 'dark' ? '#1A1E27' : '#FFFFFF';

  const dashOffset = line.length * (1 - progress);
  // The wash arrives once the line is most of the way across.
  const areaOpacity = Math.max(0, (progress - 0.55) / 0.45);

  return (
    <View
      ref={box}
      onLayout={(e: LayoutChangeEvent) => {
        setWidth(e.nativeEvent.layout.width);
        measure();
      }}
      onTouchStart={measure}
      {...responder.panHandlers}
    >
      {width > 0 && (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={`${id}stroke`} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={accent} stopOpacity={0.55} />
              <Stop offset="1" stopColor={accent} stopOpacity={1} />
            </LinearGradient>
            <LinearGradient id={`${id}wash`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={accent} stopOpacity={theme.mode === 'dark' ? 0.2 : 0.14} />
              <Stop offset="1" stopColor={accent} stopOpacity={0} />
            </LinearGradient>
          </Defs>

          {ref.length > 1 && (
            <Path
              d={refLine.d}
              stroke={theme.textTertiary}
              strokeOpacity={0.55}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          )}

          {main.length > 1 && (
            <>
              <Path d={area} fill={`url(#${id}wash)`} opacity={areaOpacity} />
              {/* Glow: the same line, wide and faint, beneath the real one. */}
              <Path
                d={line.d}
                stroke={`url(#${id}stroke)`}
                strokeOpacity={0.22}
                strokeWidth={7}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                strokeDasharray={[line.length, line.length]}
                strokeDashoffset={dashOffset}
              />
              <Path
                d={line.d}
                stroke={`url(#${id}stroke)`}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                strokeDasharray={[line.length, line.length]}
                strokeDashoffset={dashOffset}
              />
            </>
          )}

          {last && !probe && progress > 0.9 && (
            <>
              <Circle cx={last.x} cy={last.y} r={9} fill={accent} opacity={0.18} />
              <Circle cx={last.x} cy={last.y} r={4} fill={accent} stroke={surface} strokeWidth={2} />
            </>
          )}

          {probe && (
            <>
              <Line x1={probe.x} y1={PAD_TOP - 6} x2={probe.x} y2={height} stroke={theme.textTertiary} strokeWidth={1} />
              <Circle cx={probe.x} cy={probe.y} r={5} fill={accent} stroke={surface} strokeWidth={2} />
            </>
          )}
        </Svg>
      )}

      {probe && scrub !== null && (
        <Tooltip
          x={probe.x}
          width={width}
          title={labelFor(scrub)}
          value={format(values[scrub])}
          reference={compare && compare[scrub] !== undefined ? `${compareLabel} ${format(compare[scrub])}` : undefined}
          accent={accent}
        />
      )}
    </View>
  );
}

function Tooltip({
  x,
  width,
  title,
  value,
  reference,
  accent,
}: {
  x: number;
  width: number;
  title: string;
  value: string;
  reference?: string;
  accent: string;
}) {
  const { theme } = useTheme();
  const boxW = 148;
  // Follows the finger but never leaves the chart.
  const left = Math.max(0, Math.min(width - boxW, x - boxW / 2));
  return (
    <View
      pointerEvents="none"
      style={[
        styles.tip,
        {
          left,
          width: boxW,
          backgroundColor: theme.mode === 'dark' ? 'rgba(22, 27, 38, 0.94)' : 'rgba(255, 255, 255, 0.96)',
          borderColor: withAlpha(accent, 0.4),
        },
      ]}
    >
      <Text style={[styles.tipTitle, { color: theme.textSecondary }]}>{title}</Text>
      <Text style={[styles.tipValue, { color: theme.text }]}>{value}</Text>
      {reference && <Text style={[styles.tipRef, { color: theme.textTertiary }]}>{reference}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  tip: {
    position: 'absolute',
    top: -58,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  tipTitle: { fontSize: 11, fontWeight: '700' },
  tipValue: { fontSize: fontSizes.base, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tipRef: { fontSize: 11, fontWeight: '600', marginTop: 1 },
});
