import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { BottomSheetModal } from '../components/BottomSheetModal';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, radius, spacing } from '../theme/tokens';
import { RecaptchaGate, RecaptchaHandle } from '../services/RecaptchaGate';
import {
  COUNTRIES,
  Country,
  DEFAULT_COUNTRY,
  OTP_LENGTH,
  RESEND_SECONDS,
  isValidNationalNumber,
  maskPhone,
  toE164,
} from '../services/phoneAuth';
import { isCloudConfigured } from '../services/cloudConfig';

export default function PhoneLoginScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const recaptcha = useRef<RecaptchaHandle>(null);

  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [countryOpen, setCountryOpen] = useState(false);
  const [national, setNational] = useState('');
  const [step, setStep] = useState<'number' | 'code'>('number');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const valid = isValidNationalNumber(country, national);
  const e164 = toE164(country, national);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const sendCode = async () => {
    if (!valid || busy || secondsLeft > 0) return;
    setError(null);
    if (!isCloudConfigured) {
      setError('Cloud sync is not set up in this build yet, so codes cannot be sent.');
      return;
    }
    setBusy(true);
    try {
      const { sendVerificationCode } = require('../services/phoneAuth') as typeof import('../services/phoneAuth');
      const verifier = recaptcha.current;
      if (!verifier) throw new Error('Verification is not ready yet.');
      const id = await sendVerificationCode(e164, verifier as any);
      setVerificationId(id);
      setStep('code');
      setSecondsLeft(RESEND_SECONDS);
    } catch (e: any) {
      const { describeAuthError } = require('../services/auth') as typeof import('../services/auth');
      setError(describeAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    if (!verificationId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { signInWithPhoneCode } = require('../services/auth') as typeof import('../services/auth');
      await signInWithPhoneCode(verificationId, value);
      navigation.getParent()?.goBack();
      navigation.goBack();
    } catch (e: any) {
      const { describeAuthError } = require('../services/auth') as typeof import('../services/auth');
      setError(describeAuthError(e));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const onCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setCode(digits);
    if (digits.length === OTP_LENGTH) verify(digits);
  };

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => (step === 'code' ? setStep('number') : navigation.goBack())} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {step === 'number' ? 'Your number' : 'Enter code'}
        </Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.body}>
        {step === 'number' ? (
          <>
            <Text style={[styles.lead, { color: theme.textSecondary }]}>
              We'll text you a six-digit code to confirm it's you.
            </Text>

            <View style={styles.numberRow}>
              <Pressable
                onPress={() => setCountryOpen(true)}
                style={[styles.countryButton, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}
              >
                <Text style={styles.flag}>{country.flag}</Text>
                <Text style={[styles.dial, { color: theme.text }]}>{country.dial}</Text>
                <Ionicons name="chevron-down" size={14} color={theme.textTertiary} />
              </Pressable>

              <TextInput
                value={national}
                onChangeText={(v) => setNational(v.replace(/[^\d ]/g, ''))}
                keyboardType="phone-pad"
                placeholder="Mobile number"
                placeholderTextColor={theme.textTertiary}
                autoFocus
                maxLength={15}
                style={[styles.numberInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}
              />
            </View>

            {national.length > 0 && !valid && (
              <Text style={[styles.hint, { color: theme.warning }]}>
                {country.code === 'IN'
                  ? 'Indian mobile numbers are 10 digits starting with 6, 7, 8 or 9.'
                  : 'That number does not look complete yet.'}
              </Text>
            )}
          </>
        ) : (
          <>
            <Text style={[styles.lead, { color: theme.textSecondary }]}>
              Sent to {maskPhone(e164)}. It should arrive in a few seconds.
            </Text>

            <Pressable style={styles.otpRow} onPress={() => {}}>
              {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.otpBox,
                    {
                      borderColor: i === code.length ? theme.tint : theme.border,
                      backgroundColor: theme.surfaceAlt,
                    },
                  ]}
                >
                  <Text style={[styles.otpDigit, { color: theme.text }]}>{code[i] ?? ''}</Text>
                </View>
              ))}
              <TextInput
                value={code}
                onChangeText={onCodeChange}
                keyboardType="number-pad"
                autoFocus
                maxLength={OTP_LENGTH}
                // Android fills this from the SMS automatically.
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                style={styles.hiddenInput}
              />
            </Pressable>

            <Pressable
              onPress={sendCode}
              disabled={secondsLeft > 0 || busy}
              style={styles.resend}
            >
              <Text style={[styles.resendLabel, { color: secondsLeft > 0 ? theme.textTertiary : theme.tint }]}>
                {secondsLeft > 0 ? `Resend code in ${secondsLeft}s` : 'Resend code'}
              </Text>
            </Pressable>
          </>
        )}

        {error && (
          <View style={[styles.error, { backgroundColor: theme.dangerMuted }]}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.danger} />
            <Text style={[styles.errorText, { color: theme.textSecondary }]}>{error}</Text>
          </View>
        )}
      </View>

      {step === 'number' && (
        <Pressable
          onPress={sendCode}
          disabled={!valid || busy}
          style={[styles.cta, { backgroundColor: valid && !busy ? theme.tint : theme.surfaceAlt }]}
        >
          <Text style={[styles.ctaLabel, { color: valid && !busy ? '#fff' : theme.textTertiary }]}>
            {busy ? 'Sending…' : 'Send code'}
          </Text>
        </Pressable>
      )}

      <BottomSheetModal visible={countryOpen} onClose={() => setCountryOpen(false)} title="Country">
        {COUNTRIES.map((c) => (
          <Pressable
            key={c.code}
            style={styles.countryRow}
            onPress={() => {
              setCountry(c);
              setCountryOpen(false);
            }}
          >
            <Text style={styles.flag}>{c.flag}</Text>
            <Text style={[styles.countryName, { color: theme.text }]}>{c.name}</Text>
            <Text style={[styles.dial, { color: theme.textTertiary }]}>{c.dial}</Text>
          </Pressable>
        ))}
      </BottomSheetModal>

      <RecaptchaGate ref={recaptcha} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerTitle: { fontSize: fontSizes.md, fontWeight: '700' },
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  lead: { fontSize: fontSizes.base, lineHeight: 22, marginBottom: spacing.lg },
  numberRow: { flexDirection: 'row', gap: spacing.xs },
  countryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  flag: { fontSize: fontSizes.md },
  dial: { fontSize: fontSizes.base, fontWeight: '700' },
  numberInput: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  hint: { fontSize: fontSizes.xs, marginTop: spacing.xs },
  otpRow: { flexDirection: 'row', gap: spacing.xs, justifyContent: 'space-between' },
  otpBox: {
    flex: 1,
    aspectRatio: 0.82,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpDigit: { fontSize: fontSizes.xl, fontWeight: '700' },
  hiddenInput: { position: 'absolute', opacity: 0, width: '100%', height: '100%' },
  resend: { alignSelf: 'center', paddingVertical: spacing.md, marginTop: spacing.md },
  resendLabel: { fontSize: fontSizes.base, fontWeight: '600' },
  error: { flexDirection: 'row', gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, marginTop: spacing.lg, alignItems: 'flex-start' },
  errorText: { flex: 1, fontSize: fontSizes.sm, lineHeight: 18 },
  cta: { marginHorizontal: spacing.lg, marginBottom: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg, alignItems: 'center' },
  ctaLabel: { fontSize: fontSizes.base, fontWeight: '700' },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  countryName: { flex: 1, fontSize: fontSizes.base, fontWeight: '600' },
});
