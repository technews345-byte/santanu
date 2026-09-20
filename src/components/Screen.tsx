import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Aurora } from './glass/Aurora';

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
    <View style={[styles.flex, { backgroundColor: theme.bg }]}>
      {/* Glass needs something behind it worth blurring. */}
      <Aurora />
      <SafeAreaView edges={edges} style={styles.flex}>
        <View style={[styles.flex, style]}>{children}</View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
