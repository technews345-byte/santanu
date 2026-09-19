import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, radius, spacing } from '../theme/tokens';
import { useAuthStore } from '../store/useAuthStore';
import { cloudProviders, isCloudConfigured } from '../services/cloudConfig';
import { useFacebookSignIn, useGoogleSignIn } from '../services/oauth';

// Transparent asset, so it sits on whichever theme background is behind it.
const LOGO = require('../../assets/splash-icon.png');

type Provider = 'google' | 'facebook' | 'phone';

export default function LoginScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const continueAsGuest = useAuthStore((s) => s.continueAsGuest);
  const [notice, setNotice] = useState<string | null>(null);

  const intro = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(intro, {
      toValue: 1,
      duration: 620,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  // One value drives a short stagger: each element starts a little later.
  const step = (index: number) => ({
    opacity: intro.interpolate({
      inputRange: [index * 0.12, Math.min(1, 0.45 + index * 0.12)],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    }),
    transform: [
      {
        translateY: intro.interpolate({
          inputRange: [index * 0.12, Math.min(1, 0.55 + index * 0.12)],
          outputRange: [18, 0],
          extrapolate: 'clamp',
        }),
      },
    ],
  });

  const handleUnconfigured = () => {
    setNotice('Cloud sync is not set up in this build yet. Everything still saves on this device.');
  };

  const handleGuest = async () => {
    await continueAsGuest();
    navigation.goBack();
  };

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.container}>
        <Pressable style={styles.close} onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="close" size={24} color={theme.textTertiary} />
        </Pressable>

        <View style={styles.hero}>
          <Animated.View style={step(0)}>
            <Image source={LOGO} style={styles.logo} resizeMode="contain" />
          </Animated.View>

          <Animated.View style={[styles.headlineWrap, step(1)]}>
            <Text style={[styles.headline, { color: theme.text }]}>Your Money,</Text>
            <Text style={[styles.headline, { color: theme.textSecondary }]}>Simplified</Text>
          </Animated.View>
        </View>

        <Animated.View style={[styles.actions, step(2)]}>
          {cloudProviders.google ? (
            <GoogleAuthButton onDone={() => navigation.goBack()} onNotice={setNotice} />
          ) : (
            <ProviderButton
              icon="logo-google"
              label="Continue with Google"
              onPress={() => setNotice(unconfiguredMessage('Google'))}
              loading={false}
              dimmed
            />
          )}

          {cloudProviders.facebook ? (
            <FacebookAuthButton onDone={() => navigation.goBack()} onNotice={setNotice} />
          ) : (
            <ProviderButton
              icon="logo-facebook"
              label="Continue with Facebook"
              onPress={() => setNotice(unconfiguredMessage('Facebook'))}
              loading={false}
              dimmed
            />
          )}
          <ProviderButton
            icon="phone-portrait-outline"
            label="Continue with Mobile Number"
            onPress={() => (isCloudConfigured ? navigation.navigate('PhoneLogin') : handleUnconfigured())}
            loading={false}
          />

          {notice && (
            <View style={[styles.notice, { backgroundColor: theme.warningMuted }]}>
              <Ionicons name="information-circle-outline" size={16} color={theme.warning} />
              <Text style={[styles.noticeText, { color: theme.textSecondary }]}>{notice}</Text>
            </View>
          )}

          <Pressable onPress={handleGuest} style={styles.guest} hitSlop={8}>
            <Text style={[styles.guestLabel, { color: theme.textSecondary }]}>Continue as Guest</Text>
          </Pressable>
        </Animated.View>

        <Animated.View style={[styles.footer, step(3)]}>
          <Ionicons name="lock-closed-outline" size={14} color={theme.textTertiary} />
          <Text style={[styles.footerText, { color: theme.textTertiary }]}>
            Your expenses stay on this device and back up to your account over an encrypted connection.
          </Text>
        </Animated.View>
      </View>
    </Screen>
  );
}

function unconfiguredMessage(provider: string) {
  return isCloudConfigured
    ? `${provider} sign-in needs its OAuth client id added to this build. Mobile number sign-in works now.`
    : 'Cloud sync is not set up in this build yet. Everything still saves on this device.';
}

/**
 * Each provider gets its own component because Expo's auth hooks throw when
 * their client id is missing, which blanks the whole screen. Mounting them
 * separately means a project with only some providers set up still works.
 */
function GoogleAuthButton({ onDone, onNotice }: { onDone: () => void; onNotice: (message: string) => void }) {
  const google = useGoogleSignIn(onDone);

  useEffect(() => {
    if (google.error) onNotice(google.error);
  }, [google.error]);

  return (
    <ProviderButton
      icon="logo-google"
      label="Continue with Google"
      loading={google.busy}
      onPress={() => (google.available ? google.signIn() : onNotice(unconfiguredMessage('Google')))}
    />
  );
}

function FacebookAuthButton({ onDone, onNotice }: { onDone: () => void; onNotice: (message: string) => void }) {
  const facebook = useFacebookSignIn(onDone);

  useEffect(() => {
    if (facebook.error) onNotice(facebook.error);
  }, [facebook.error]);

  return (
    <ProviderButton
      icon="logo-facebook"
      label="Continue with Facebook"
      loading={facebook.busy}
      onPress={() => (facebook.available ? facebook.signIn() : onNotice(unconfiguredMessage('Facebook')))}
    />
  );
}

function ProviderButton({
  icon,
  label,
  onPress,
  loading,
  dimmed,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  loading: boolean;
  dimmed?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.provider,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          shadowColor: theme.shadow,
          opacity: dimmed ? 0.55 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
      ]}
    >
      <Ionicons name={loading ? 'ellipsis-horizontal' : icon} size={20} color={theme.text} />
      <Text style={[styles.providerLabel, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  close: { alignSelf: 'flex-end', padding: spacing.xs },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 190, height: 190 },
  headlineWrap: { alignItems: 'center', marginTop: spacing.lg },
  headline: { fontSize: fontSizes.xxl, fontWeight: '800', letterSpacing: -0.5, lineHeight: 38 },
  actions: { gap: spacing.sm },
  provider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 2,
  },
  providerLabel: { fontSize: fontSizes.base, fontWeight: '600' },
  notice: { flexDirection: 'row', gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, alignItems: 'flex-start' },
  noticeText: { flex: 1, fontSize: fontSizes.xs, lineHeight: 17 },
  guest: { alignSelf: 'center', paddingVertical: spacing.sm, marginTop: spacing.xxs },
  guestLabel: { fontSize: fontSizes.base, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginTop: spacing.lg, paddingHorizontal: spacing.xs },
  footerText: { flex: 1, fontSize: fontSizes.xs, lineHeight: 16 },
});
