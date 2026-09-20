import { ApplicationVerifier } from 'firebase/auth';
import { getCloudConfig } from './cloudConfig';

export const OTP_LENGTH = 6;
export const RESEND_SECONDS = 45;

export interface Country {
  code: string;
  dial: string;
  flag: string;
  name: string;
}

export const COUNTRIES: Country[] = [
  { code: 'IN', dial: '+91', flag: '🇮🇳', name: 'India' },
  { code: 'US', dial: '+1', flag: '🇺🇸', name: 'United States' },
  { code: 'GB', dial: '+44', flag: '🇬🇧', name: 'United Kingdom' },
  { code: 'AE', dial: '+971', flag: '🇦🇪', name: 'United Arab Emirates' },
  { code: 'SG', dial: '+65', flag: '🇸🇬', name: 'Singapore' },
  { code: 'AU', dial: '+61', flag: '🇦🇺', name: 'Australia' },
  { code: 'CA', dial: '+1', flag: '🇨🇦', name: 'Canada' },
  { code: 'DE', dial: '+49', flag: '🇩🇪', name: 'Germany' },
  { code: 'NP', dial: '+977', flag: '🇳🇵', name: 'Nepal' },
  { code: 'BD', dial: '+880', flag: '🇧🇩', name: 'Bangladesh' },
];

export const DEFAULT_COUNTRY = COUNTRIES[0];

/** Digits only, and long enough to be a real subscriber number. */
export function isValidNationalNumber(country: Country, input: string): boolean {
  const digits = input.replace(/\D/g, '');
  if (country.code === 'IN') return /^[6-9]\d{9}$/.test(digits);
  return digits.length >= 6 && digits.length <= 14;
}

export function toE164(country: Country, input: string): string {
  return `${country.dial}${input.replace(/\D/g, '')}`;
}

/** Masked for display: enough digits to recognise your own number, not enough
 * for someone reading over your shoulder to note it down. */
export function maskPhone(e164: string): string {
  const visible = 4;
  const head = 3;
  if (e164.length <= head + visible) return e164;
  return `${e164.slice(0, head)}${'•'.repeat(e164.length - head - visible)}${e164.slice(-visible)}`;
}

/**
 * Asks Identity Toolkit to text a code, and returns the session id that pairs
 * with it.
 *
 * The SDK's own verifyPhoneNumber cannot be used here: it reaches for
 * reCAPTCHA through the DOM, which React Native has none of, and fails with
 * operation-not-supported-in-this-environment before the verifier is ever
 * consulted. The endpoint underneath has no such requirement.
 *
 * The session id it returns is exactly what PhoneAuthProvider.credential
 * expects, so signing in afterwards stays on the SDK's supported path.
 */
export async function sendVerificationCode(
  phoneE164: string,
  verifier: ApplicationVerifier | null
): Promise<string> {
  // Numbers registered for testing need no human check, and neither do
  // projects that leave reCAPTCHA unenforced, so only fetch a token if the
  // server asks for one. That keeps the challenge out of the way until it
  // earns its place.
  try {
    return await requestCode(phoneE164);
  } catch (error) {
    if (!needsCaptcha(error) || !verifier) throw error;
    const token = await verifier.verify();
    return requestCode(phoneE164, token);
  }
}

async function requestCode(phoneNumber: string, recaptchaToken?: string): Promise<string> {
  const { apiKey } = getCloudConfig();
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recaptchaToken ? { phoneNumber, recaptchaToken } : { phoneNumber }),
    }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.sessionInfo) throw toAuthError(body);
  return body.sessionInfo as string;
}

function serverMessage(error: any): string {
  return String(error?.serverMessage ?? '');
}

function needsCaptcha(error: unknown): boolean {
  const message = serverMessage(error);
  return message.startsWith('MISSING_RECAPTCHA_TOKEN') || message.startsWith('CAPTCHA_CHECK_FAILED');
}

/** Identity Toolkit reports in SCREAMING_CASE; the app speaks auth/ codes. */
const SERVER_CODES: Record<string, string> = {
  BILLING_NOT_ENABLED: 'auth/billing-not-enabled',
  OPERATION_NOT_ALLOWED: 'auth/operation-not-allowed',
  CONFIGURATION_NOT_FOUND: 'auth/configuration-not-found',
  INVALID_PHONE_NUMBER: 'auth/invalid-phone-number',
  MISSING_PHONE_NUMBER: 'auth/invalid-phone-number',
  CAPTCHA_CHECK_FAILED: 'auth/captcha-check-failed',
  MISSING_RECAPTCHA_TOKEN: 'auth/captcha-check-failed',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'auth/too-many-requests',
  QUOTA_EXCEEDED: 'auth/too-many-requests',
};

function toAuthError(body: any): Error & { code?: string; serverMessage?: string } {
  const raw = String(body?.error?.message ?? 'Something went wrong. Please try again.');
  const key = Object.keys(SERVER_CODES).find((k) => raw.startsWith(k));
  const error = new Error(raw) as Error & { code?: string; serverMessage?: string };
  error.serverMessage = raw;
  if (key) error.code = SERVER_CODES[key];
  return error;
}
