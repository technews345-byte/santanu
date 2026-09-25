import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme/tokens';

export const EXPENSE_ICONS: (keyof typeof Ionicons.glyphMap)[] = [
  'restaurant-outline', 'cart-outline', 'car-outline', 'flame-outline', 'flash-outline', 'bag-outline',
  'heart-outline', 'film-outline', 'repeat-outline', 'home-outline', 'school-outline', 'airplane-outline',
  'paw-outline', 'fitness-outline', 'sparkles-outline', 'cut-outline', 'gift-outline', 'phone-portrait-outline', 'construct-outline',
  'medkit-outline', 'beer-outline', 'book-outline', 'game-controller-outline', 'shirt-outline', 'ellipsis-horizontal-outline',
];

export const INCOME_ICONS: (keyof typeof Ionicons.glyphMap)[] = [
  'cash-outline', 'laptop-outline', 'trending-up-outline', 'gift-outline', 'briefcase-outline', 'business-outline',
  'card-outline', 'wallet-outline', 'ribbon-outline', 'ellipsis-horizontal-outline',
];

export const INVESTMENT_ICONS: (keyof typeof Ionicons.glyphMap)[] = [
  'pie-chart-outline', 'trending-up-outline', 'repeat-outline', 'diamond-outline', 'lock-closed-outline',
  'shield-checkmark-outline', 'logo-bitcoin', 'business-outline', 'bar-chart-outline', 'cash-outline',
  'wallet-outline', 'ellipsis-horizontal-outline',
];

export const ACCOUNT_ICONS: (keyof typeof Ionicons.glyphMap)[] = [
  'cash-outline', 'card-outline', 'wallet-outline', 'business-outline', 'home-outline', 'briefcase-outline',
];

export function IconPicker({
  icons,
  value,
  color,
  onChange,
}: {
  icons: (keyof typeof Ionicons.glyphMap)[];
  value: string;
  color: string;
  onChange: (icon: string) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.wrap}>
      {icons.map((icon) => {
        const active = value === icon;
        return (
          <Pressable
            key={String(icon)}
            onPress={() => onChange(String(icon))}
            style={[
              styles.item,
              { backgroundColor: active ? color : theme.surfaceAlt, borderColor: active ? color : theme.border },
            ]}
          >
            <Ionicons name={icon} size={20} color={active ? '#fff' : theme.textSecondary} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  item: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
});
