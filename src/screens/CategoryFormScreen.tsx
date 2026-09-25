import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { GlassButton } from '../components/glass/GlassButton';
import { IconBadge } from '../components/IconBadge';
import { ColorPicker } from '../components/ColorPicker';
import { IconPicker, EXPENSE_ICONS, INCOME_ICONS, INVESTMENT_ICONS } from '../components/IconPicker';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, radius, spacing } from '../theme/tokens';
import { useStore } from '../store/useStore';

export default function CategoryFormScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { categoryId, type } = route.params;
  const { categories, addCategory, updateCategory, removeCategory } = useStore();
  const existing = categoryId ? categories.find((c) => c.id === categoryId) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [color, setColor] = useState(existing?.color ?? '#6366F1');
  const [icon, setIcon] = useState(
    existing?.icon ?? (type === 'income' ? 'cash-outline' : type === 'investment' ? 'pie-chart-outline' : 'pricetag-outline')
  );

  const formType = existing?.type ?? type;
  const iconSet = formType === 'income' ? INCOME_ICONS : formType === 'investment' ? INVESTMENT_ICONS : EXPENSE_ICONS;

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Enter a name');
      return;
    }
    if (existing) {
      await updateCategory(existing.id, { name: name.trim(), color, icon });
    } else {
      await addCategory({ name: name.trim(), color, icon, type });
    }
    navigation.goBack();
  };

  const handleArchive = () => {
    if (!existing) return;
    Alert.alert('Archive category?', 'It will be hidden from pickers but past transactions keep it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          await updateCategory(existing.id, { archived: true });
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="close" size={26} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{existing ? 'Edit Category' : 'New Category'}</Text>
        {existing ? (
          <Pressable onPress={handleArchive} hitSlop={10}>
            <Ionicons name="archive-outline" size={22} color={theme.danger} />
          </Pressable>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.previewRow}>
          <IconBadge icon={icon as any} color={color} size={64} />
        </View>

        <Text style={[styles.label, { color: theme.textSecondary }]}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Groceries"
          placeholderTextColor={theme.textTertiary}
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Color</Text>
        <ColorPicker value={color} onChange={setColor} />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Icon</Text>
        <IconPicker icons={iconSet} value={icon} color={color} onChange={setIcon} />

        <GlassButton label="Save Category" onPress={handleSave} style={styles.saveButton} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerTitle: { fontSize: fontSizes.md, fontWeight: '700' },
  body: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  previewRow: { alignItems: 'center', marginBottom: spacing.lg },
  label: { fontSize: fontSizes.sm, fontWeight: '700', marginBottom: spacing.xs, marginTop: spacing.md },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSizes.base },
  saveButton: { marginTop: spacing.xl },
});
