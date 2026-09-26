import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../theme/type';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { IconBadge } from '../components/IconBadge';
import { GlassTabs } from '../components/glass/GlassTabs';
import { GlassPressable } from '../components/glass/GlassPressable';
import { EmptyState } from '../components/EmptyState';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, radius, spacing } from '../theme/tokens';
import { useStore } from '../store/useStore';
import { CategoryType } from '../types';

const TYPES: { key: CategoryType; label: string }[] = [
  { key: 'expense', label: 'Expense' },
  { key: 'income', label: 'Income' },
  { key: 'investment', label: 'Investment' },
];

/**
 * Every category, to rename, recolour, re-icon or add to. Kept on its own
 * page, one tap from Settings, rather than as a list of thirty rows in the
 * middle of it: it is visited to change something, not to look at.
 */
export default function CategoriesScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const categories = useStore((s) => s.categories);
  const [type, setType] = useState<CategoryType>('expense');
  const visible = categories.filter((c) => c.type === type && !c.archived);

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Categories</Text>
        <Pressable
          onPress={() => navigation.navigate('CategoryForm', { type })}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Add ${type} category`}
        >
          <Ionicons name="add" size={26} color={theme.tint} />
        </Pressable>
      </View>

      <View style={styles.tabs}>
        <GlassTabs options={TYPES} value={type} onChange={setType} />
      </View>

      <FlatList
        data={visible}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<EmptyState icon="pricetags-outline" title="No categories yet" subtitle="Tap + to add one" />}
        renderItem={({ item }) => (
          <GlassPressable
            level="row"
            feedback="press"
            borderRadius={radius.lg}
            style={styles.rowOuter}
            contentStyle={styles.row}
            onPress={() => navigation.navigate('CategoryForm', { categoryId: item.id, type: item.type })}
            accessibilityLabel={`Edit ${item.name}`}
          >
            <IconBadge icon={item.icon as any} color={item.color} size={38} />
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
          </GlassPressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: { fontSize: fontSizes.md, fontWeight: '700' },
  tabs: { paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxxl },
  rowOuter: { marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  name: { flex: 1, fontSize: fontSizes.base, fontWeight: '600' },
});
