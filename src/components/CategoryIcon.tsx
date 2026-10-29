import React from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeContext';

type IconName = keyof typeof Ionicons.glyphMap;

/** Use the matching outline when available, without changing the saved icon. */
export function categoryGlyphName(icon: IconName): IconName {
  if (typeof icon !== 'string') return 'pricetag-outline';
  const outline = `${icon}-outline` as IconName;
  if (!icon.endsWith('-outline') && outline in Ionicons.glyphMap) return outline;
  return icon in Ionicons.glyphMap ? icon : 'pricetag-outline';
}

/** The same restrained glyph used inside the budget progress rings. */
export const CategoryGlyph = React.memo(function CategoryGlyph({ icon, size = 22 }: {
  icon: IconName; size?: number;
}) {
  const { theme } = useTheme();
  return <Ionicons name={categoryGlyphName(icon)} size={size} color={theme.textSecondary} />;
});

/** A quiet, static ring for category displays that have no budget progress. */
export const CategoryIcon = React.memo(function CategoryIcon({ icon, size = 40, ringColor }: {
  icon: IconName; size?: number; ringColor?: string;
}) {
  const diameter = size - 4;
  return <View accessible={false} importantForAccessibility="no" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: diameter, height: diameter, borderRadius: diameter / 2,
      borderWidth: Math.max(2, Math.round(size * 4 / 56)), borderColor: ringColor ?? 'rgba(255,255,255,0.12)',
      alignItems: 'center', justifyContent: 'center' }}>
      <CategoryGlyph icon={icon} size={Math.round(size * 22 / 56)} />
    </View>
  </View>;
});
