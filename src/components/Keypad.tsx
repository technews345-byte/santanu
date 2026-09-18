import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
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
            const labelColor = isOperator ? theme.tint : isAction ? theme.expense : theme.text;
            return (
              <Pressable
                key={def.key}
                onPress={() => handlePress(def.key)}
                style={({ pressed }) => [
                  styles.key,
                  {
                    borderColor: isOperator ? theme.tint : theme.border,
                    backgroundColor: pressed ? theme.surfaceAlt : isOperator ? theme.tintMuted : theme.surface,
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
