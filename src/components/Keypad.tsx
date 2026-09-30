import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../theme/type';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { shade, withAlpha } from '../theme/color';
import { fontSizes, radius, spacing } from '../theme/tokens';

type KeyKind = 'digit' | 'operator' | 'action';

interface KeyDef {
  key: string;
  label: string;
  kind: KeyKind;
  icon?: keyof typeof Ionicons.glyphMap;
}

const ROWS: KeyDef[][] = [
  [
    { key: 'clear', label: 'C', kind: 'action' },
    { key: '/', label: '÷', kind: 'operator' },
    { key: '*', label: '×', kind: 'operator' },
    { key: 'backspace', label: '', kind: 'action', icon: 'backspace-outline' },
  ],
  [
    { key: '7', label: '7', kind: 'digit' },
    { key: '8', label: '8', kind: 'digit' },
    { key: '9', label: '9', kind: 'digit' },
    { key: '-', label: '−', kind: 'operator' },
  ],
  [
    { key: '4', label: '4', kind: 'digit' },
    { key: '5', label: '5', kind: 'digit' },
    { key: '6', label: '6', kind: 'digit' },
    { key: '+', label: '+', kind: 'operator' },
  ],
  [
    { key: '1', label: '1', kind: 'digit' },
    { key: '2', label: '2', kind: 'digit' },
    { key: '3', label: '3', kind: 'digit' },
    { key: '%', label: '%', kind: 'operator' },
  ],
  [
    { key: '00', label: '00', kind: 'digit' },
    { key: '0', label: '0', kind: 'digit' },
    { key: '.', label: '.', kind: 'digit' },
    { key: '=', label: '=', kind: 'operator' },
  ],
];

export function Keypad({ onKeyPress }: { onKeyPress: (key: string) => void }) {
  const { theme } = useTheme();

  const handlePress = (key: string) => {
    Haptics.selectionAsync().catch(() => {});
    onKeyPress(key);
  };

  return (
    <View style={styles.pad}>
      {ROWS.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((def) => {
            const isOperator = def.kind === 'operator';
            const isAction = def.kind === 'action';
            const dark = theme.mode === 'dark';
            // Keys are small panes of the same glass as everything else:
            // operators tinted with the accent, the rest plain, each with
            // light caught along its top edge rather than a drawn outline.
            const labelColor = isOperator
              ? dark
                ? shade(theme.tint, 0.5)
                : theme.tint
              : isAction
                ? theme.expense
                : theme.text;
            const rest = isOperator ? withAlpha(theme.tint, dark ? 0.14 : 0.1) : theme.glass;
            const pressedFill = isOperator ? withAlpha(theme.tint, dark ? 0.26 : 0.18) : theme.glassControl;
            return (
              <Pressable
                key={def.key}
                onPress={() => handlePress(def.key)}
                accessibilityRole="button"
                accessibilityLabel={def.icon ? 'Delete' : def.key === 'clear' ? 'Clear' : def.label}
                style={({ pressed }) => [
                  styles.key,
                  {
                    backgroundColor: pressed ? pressedFill : rest,
                    borderColor: isOperator ? withAlpha(theme.tint, dark ? 0.3 : 0.28) : theme.glassBorder,
                    borderTopColor: dark ? 'rgba(235, 242, 255, 0.16)' : 'rgba(255, 255, 255, 0.95)',
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                  },
                ]}
              >
                {def.icon ? (
                  <Ionicons name={def.icon} size={24} color={labelColor} />
                ) : (
                  <Text style={[styles.keyLabel, { color: labelColor }]}>{def.label}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.xs, gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.xs },
  key: {
    flex: 1,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
  },
  keyLabel: { fontSize: fontSizes.xl, fontWeight: '600' },
});
