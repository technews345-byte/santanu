import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { categoryPalette } from '../theme/tokens';

export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <View style={styles.wrap}>
      {categoryPalette.map((color) => (
        <Pressable key={color} onPress={() => onChange(color)} style={[styles.swatch, { backgroundColor: color }]}>
          {value === color && <Ionicons name="checkmark" size={16} color="#fff" />}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
