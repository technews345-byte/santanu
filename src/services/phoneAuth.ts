import { ApplicationVerifier, PhoneAuthProvider } from 'firebase/auth';
import { getFirebaseAuth } from './firebase';

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

export async function sendVerificationCode(phoneE164: string, verifier: ApplicationVerifier): Promise<string> {
  const provider = new PhoneAuthProvider(getFirebaseAuth());
  // Firebase sends the SMS and returns an id; the code itself never touches
  // this app, and nothing about it is stored locally.
  return provider.verifyPhoneNumber(phoneE164, verifier);
}
