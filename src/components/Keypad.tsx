import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, radius, spacing } from '../theme/tokens';

const KEYS: (string | 'backspace')[] = ['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '.', '0', 'backspace', '+'];

export function Keypad({ onKeyPress }: { onKeyPress: (key: string) => void }) {
  const { theme } = useTheme();

  const handlePress = (key: string) => {
    Haptics.selectionAsync().catch(() => {});
    onKeyPress(key);
  };

  return (
    <View style={styles.grid}>
      {KEYS.map((key) => {
        const isOperator = key === '/' || key === '*' || key === '-' || key === '+';
        const isBackspace = key === 'backspace';
        return (
          <Pressable
            key={key}
            onPress={() => handlePress(key)}
            style={({ pressed }) => [
              styles.key,
              { backgroundColor: pressed ? theme.surfaceAlt : 'transparent' },
            ]}
          >
            {isBackspace ? (
              <Ionicons name="backspace-outline" size={22} color={theme.text} />
            ) : (
              <Text style={[styles.keyLabel, { color: isOperator ? theme.tint : theme.text }]}>
                {key === '/' ? '÷' : key === '*' ? '×' : key}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  key: {
    width: '25%',
    aspectRatio: 1.6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  keyLabel: { fontSize: fontSizes.xl, fontWeight: '600' },
});
