import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';

export function Screen({
  children,
  style,
  edges = ['top', 'left', 'right'],
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: Edge[];
}) {
  const { theme } = useTheme();
  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: theme.bg }]}>
      <View style={[styles.flex, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
