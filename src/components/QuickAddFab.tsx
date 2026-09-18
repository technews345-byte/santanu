import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme/tokens';

export function QuickAddFab() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();

  return (
    <Pressable
      onPress={() => navigation.navigate('TransactionEntry', {})}
      style={({ pressed }) => [
        styles.fab,
        {
          backgroundColor: theme.tint,
          shadowColor: theme.tint,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        },
      ]}
    >
      <Ionicons name="add" size={28} color={theme.textInverted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
});
