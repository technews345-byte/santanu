import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../theme/type';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, spacing } from '../theme/tokens';

export function EmptyState({ icon, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={40} color={theme.textTertiary} />
      <Text style={[styles.title, { color: theme.textSecondary }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: theme.textTertiary }]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
  title: { fontSize: fontSizes.base, fontWeight: '600', marginTop: spacing.sm, textAlign: 'center' },
  subtitle: { fontSize: fontSizes.sm, marginTop: spacing.xxs, textAlign: 'center' },
});
