import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { radius, spacing } from '../theme/tokens';
import { GlassLevel, GlassSurface } from './glass/GlassSurface';

/**
 * The app's panel. Every screen builds from this, so it is where the glass
 * comes from rather than something each screen re-states.
 *
 * `level` decides how solid the fill is: `raised` for the panels carrying the
 * largest figures, `row` for the many small ones in a list, which also skip
 * the blur so scrolling stays at full speed.
 */
export function Card({
  children,
  style,
  padded = true,
  level = 'panel',
  blur,
  borderRadius = radius.xl,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  level?: GlassLevel;
  blur?: boolean;
  borderRadius?: number;
}) {
  return (
    <GlassSurface
      level={level}
      blur={blur ?? level !== 'row'}
      borderRadius={borderRadius}
      style={style}
      contentStyle={{ padding: padded ? spacing.md : 0 }}
    >
      {children}
    </GlassSurface>
  );
}
