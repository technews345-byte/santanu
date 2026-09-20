import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { GradientBadge } from './glass/GradientBadge';

/**
 * Every category, account and action wears one of these.
 *
 * A pale tinted disc vanishes against glass — the two are both washes of the
 * same light. A saturated gradient circle with its own shadow is the one
 * element on a pane that clearly sits in front of it, which is what gives the
 * glass its depth. Used everywhere, so the app reads as one set of objects.
 */
export function IconBadge({
  icon,
  color,
  size = 40,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  size?: number;
  /** Kept for callers that set it; the disc scales its own glyph. */
  iconSize?: number;
}) {
  return <GradientBadge icon={icon} color={color} size={size} />;
}
