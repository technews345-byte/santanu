import React, { useRef } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { BlurTargetView } from 'expo-blur';
import { useTheme } from '../theme/ThemeContext';
import { Aurora, BlurTargetContext } from './glass/Aurora';

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
  // The room is what every pane on the screen blurs. It sits beside the
  // content rather than around it: a pane inside the view it blurs would be
  // blurring itself.
  const room = useRef<View>(null);
  return (
    <View style={[styles.flex, { backgroundColor: theme.bg }]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <BlurTargetView ref={room} style={styles.flex}>
          <Aurora />
        </BlurTargetView>
      </View>
      <BlurTargetContext.Provider value={room}>
        <SafeAreaView edges={edges} style={styles.flex}>
          <View style={[styles.flex, style]}>{children}</View>
        </SafeAreaView>
      </BlurTargetContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
