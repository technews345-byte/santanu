import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { format } from 'date-fns/format';
import { Text } from '../theme/type';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { GlassButton } from '../components/glass/GlassButton';
import { GlassPressable } from '../components/glass/GlassPressable';
import { IconBadge } from '../components/IconBadge';
import { BottomSheetModal } from '../components/BottomSheetModal';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, radius, spacing } from '../theme/tokens';
import { useStore } from '../store/useStore';
import { formatMoney } from '../utils/money';
import { KIND_ICONS, parseReceipt, ParsedReceipt } from '../utils/receipt';
import { ocrSupported, prepareReceipt, readText } from '../services/ocr';
import { Category } from '../types';

type Photo = { uri: string; width: number; height: number };

/**
 * Turning a paper receipt into an expense.
 *
 * Take a photo or pick one from the gallery — cropped as it comes in — and
 * the receipt is read on the phone: the amount paid, the date, the shop, and
 * a guess at the category from what's on it. Everything read can be changed
 * on the expense form it opens, where the photo is already attached.
 */
export default function ScanReceiptScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const { height: screenH } = useWindowDimensions();
  const categories = useStore((s) => s.categories);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<ParsedReceipt | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense' && !c.archived),
    [categories]
  );
  const category = expenseCategories.find((c) => c.id === categoryId) ?? null;

  const read = async (next: Photo) => {
    setPhoto(next);
    setResult(null);
    setReading(true);
    try {
      const blocks = await readText(next.uri);
      const parsed = parseReceipt(blocks);
      setResult(parsed);
      setCategoryId(categoryFor(parsed, expenseCategories)?.id ?? null);
    } catch {
      setResult({ amount: null, date: null, merchant: null, kind: null });
    } finally {
      setReading(false);
    }
  };

  const pick = async (fromCamera: boolean) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        fromCamera ? 'Camera access needed' : 'Photo access needed',
        fromCamera ? 'Allow the camera to photograph your receipt.' : 'Allow access to your photos to pick a receipt.'
      );
      return;
    }
    // The crop step comes with the picker: frame just the receipt, and the
    // reading is cleaner for it.
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, quality: 1 };
    const picked = fromCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    try {
      read(await prepareReceipt(asset.uri, asset.width));
    } catch {
      read({ uri: asset.uri, width: asset.width, height: asset.height });
    }
  };

  const rotate = async () => {
    if (!photo || reading) return;
    try {
      read(await prepareReceipt(photo.uri, photo.width, 90));
    } catch {
      // Leave the photo as it is.
    }
  };

  const proceed = () => {
    navigation.replace('TransactionEntry', {
      initialType: 'expense',
      prefill: {
        amount: result?.amount ?? undefined,
        categoryId: category?.id,
        note: result?.merchant ?? undefined,
        date: result?.date?.toISOString(),
        attachments: photo ? [photo.uri] : [],
      },
    });
  };

  const previewH = Math.min(420, screenH * 0.42);

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Scan Receipt</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!photo ? (
          <>
            <Text style={[styles.hero, { color: theme.text }]}>Scan. Save.{'\n'}Forget the paper.</Text>
            <Text style={[styles.heroSub, { color: theme.textSecondary }]}>
              Turn receipts into expenses. Read on your phone — never uploaded.
            </Text>
            <Card level="raised" style={styles.emptyCard}>
              <View style={styles.emptyInner}>
                <IconBadge icon={'receipt-outline' as any} color={theme.teal} size={96} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>Photograph a receipt</Text>
                <Text style={[styles.emptyBody, { color: theme.textTertiary }]}>
                  Lay it flat in good light, with the total in view. You’ll be able to crop it next.
                </Text>
              </View>
            </Card>
          </>
        ) : (
          <Card level="raised" padded={false} style={styles.previewCard}>
            <View style={[styles.preview, { height: previewH }]}>
              <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
              <Pressable
                style={[styles.rotate, { backgroundColor: theme.overlay }]}
                onPress={rotate}
                accessibilityRole="button"
                accessibilityLabel="Rotate"
              >
                <Ionicons name="refresh" size={20} color="#FFFFFF" />
              </Pressable>
            </View>
          </Card>
        )}

        <View style={styles.sources}>
          <GlassButton label="Camera" icon="camera" onPress={() => pick(true)} style={styles.source} color={theme.teal} />
          <GlassButton label="Gallery" icon="images" variant="secondary" onPress={() => pick(false)} style={styles.source} />
        </View>

        {!ocrSupported && (
          <Text style={[styles.note, { color: theme.textTertiary }]}>
            Reading receipts works in the Android and iPhone app. Here you can still attach the photo.
          </Text>
        )}

        {photo && (
          <Card style={styles.resultCard}>
            {reading ? (
              <View style={styles.readingRow}>
                <ActivityIndicator color={theme.tint} />
                <Text style={[styles.readingText, { color: theme.textSecondary }]}>Reading your receipt…</Text>
              </View>
            ) : (
              <>
                <View style={styles.detectedRow}>
                  <View style={[styles.check, { backgroundColor: result?.amount ? theme.successMuted : theme.warningMuted }]}>
                    <Ionicons
                      name={result?.amount ? 'checkmark' : 'alert'}
                      size={18}
                      color={result?.amount ? theme.success : theme.warning}
                    />
                  </View>
                  <Text style={[styles.detectedTitle, { color: theme.text }]}>
                    {result?.amount ? 'Receipt detected' : 'Couldn’t find the total'}
                  </Text>
                </View>
                {!result?.amount && (
                  <Text style={[styles.note, { color: theme.textTertiary, marginTop: spacing.xs }]}>
                    Try a sharper, straighter photo, or carry on and type the amount.
                  </Text>
                )}

                <Field label="Amount" value={result?.amount ? formatMoney(result.amount) : '—'} strong color={theme.tint} />
                {result?.date && <Field label="Date" value={format(result.date, 'd MMM yyyy, h:mm a')} />}
                {result?.merchant && <Field label="From" value={result.merchant} />}

                <GlassPressable
                  level="row"
                  feedback="press"
                  borderRadius={radius.lg}
                  style={styles.categoryRow}
                  contentStyle={styles.categoryInner}
                  onPress={() => setSheetOpen(true)}
                  accessibilityLabel="Change category"
                >
                  {category ? (
                    <IconBadge icon={category.icon as any} color={category.color} size={34} />
                  ) : (
                    <Ionicons name="pricetag-outline" size={22} color={theme.textSecondary} />
                  )}
                  <Text style={[styles.categoryText, { color: theme.text }]} numberOfLines={1}>
                    {category ? `Detected category: ${category.name}` : 'Choose a category'}
                  </Text>
                  <Text style={[styles.change, { color: theme.tint }]}>Change</Text>
                </GlassPressable>
              </>
            )}
          </Card>
        )}

        {photo && !reading && (
          <GlassButton label="Continue to Add Expense" icon="arrow-forward" onPress={proceed} style={styles.continue} />
        )}
      </ScrollView>

      <BottomSheetModal visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Category">
        <View style={styles.grid}>
          {expenseCategories.map((c) => (
            <Pressable
              key={c.id}
              style={styles.gridItem}
              onPress={() => {
                setCategoryId(c.id);
                setSheetOpen(false);
              }}
            >
              <IconBadge icon={c.icon as any} color={c.color} size={48} />
              <Text style={[styles.gridLabel, { color: theme.text }]} numberOfLines={1}>
                {c.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </BottomSheetModal>
    </Screen>
  );
}

function Field({ label, value, strong, color }: { label: string; value: string; strong?: boolean; color?: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.textTertiary }]}>{label}</Text>
      <Text
        style={[strong ? styles.fieldStrong : styles.fieldValue, { color: color ?? theme.text }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/** The category a receipt most likely belongs to, by the icons categories wear. */
function categoryFor(parsed: ParsedReceipt, categories: Category[]): Category | undefined {
  if (!parsed.kind) return undefined;
  const icons = KIND_ICONS[parsed.kind];
  const base = (icon: string) => icon.replace(/-outline$|-sharp$/, '');
  for (const icon of icons) {
    const match = categories.find((c) => base(c.icon) === icon);
    if (match) return match;
  }
  return undefined;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: { fontSize: fontSizes.md, fontWeight: '700' },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxxl },
  hero: { fontSize: 32, fontWeight: '800', letterSpacing: -0.8, lineHeight: 38, marginTop: spacing.xs },
  heroSub: { fontSize: fontSizes.base, marginTop: spacing.xs, marginBottom: spacing.lg, lineHeight: 21 },
  emptyCard: { marginBottom: spacing.md },
  emptyInner: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  emptyTitle: { fontSize: fontSizes.lg, fontWeight: '700' },
  emptyBody: { fontSize: fontSizes.sm, textAlign: 'center', lineHeight: 19, paddingHorizontal: spacing.md },
  previewCard: { marginTop: spacing.xs, marginBottom: spacing.md },
  preview: { borderRadius: radius.xl, overflow: 'hidden' },
  rotate: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sources: { flexDirection: 'row', gap: spacing.sm },
  source: { flex: 1 },
  note: { fontSize: fontSizes.sm, lineHeight: 19, marginTop: spacing.sm },
  resultCard: { marginTop: spacing.md },
  readingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  readingText: { fontSize: fontSizes.base, fontWeight: '600' },
  detectedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  check: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  detectedTitle: { fontSize: fontSizes.md, fontWeight: '700' },
  field: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md, marginTop: spacing.sm },
  fieldLabel: { width: 64, fontSize: fontSizes.sm, fontWeight: '600' },
  fieldValue: { flex: 1, fontSize: fontSizes.base, fontWeight: '600' },
  fieldStrong: { flex: 1, fontSize: fontSizes.xl, fontWeight: '800' },
  categoryRow: { marginTop: spacing.md },
  categoryInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
  categoryText: { flex: 1, fontSize: fontSizes.base, fontWeight: '600' },
  change: { fontSize: fontSizes.sm, fontWeight: '700' },
  continue: { marginTop: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gridItem: { width: '23%', alignItems: 'center', marginBottom: spacing.md, gap: 4 },
  gridLabel: { fontSize: fontSizes.xs, fontWeight: '600', textAlign: 'center' },
});
