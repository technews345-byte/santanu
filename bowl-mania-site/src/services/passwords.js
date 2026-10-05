import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scryptAsync = promisify(scrypt);
// Cost equivalent to OWASP's scrypt minimum (N=2^17, r=8, p=1) while using 64 MB of memory per hash.
const N = 65536, R = 8, P = 2, LEN = 64, MAXMEM = 256 * 1024 * 1024;

/** scrypt hash stored as scrypt$N$r$p$salt$hash (base64url). Plain passwords are never stored. */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(String(password).normalize('NFKC'), salt, LEN, { N, r: R, p: P, maxmem: MAXMEM });
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}
export async function verifyPassword(password, stored) {
  const [alg, n, r, p, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !hash || !(+n > 1 && +r > 0 && +p > 0)) return false;
  const expected = Buffer.from(hash, 'base64url');
  if (expected.length < 32) return false;
  try {
    const key = await scryptAsync(String(password).normalize('NFKC'), Buffer.from(salt, 'base64url'), expected.length, { N: +n, r: +r, p: +p, maxmem: MAXMEM });
    return timingSafeEqual(key, expected);
  } catch { return false; }
}
/** True for hashes made with weaker settings than today's; they are upgraded at the next successful sign-in. */
export function needsRehash(stored) {
  const [alg, n, r, p] = String(stored || '').split('$');
  return alg !== 'scrypt' || +n * +r * +p < N * R * P;
}
export const passwordRule = 'Use at least 10 characters with letters and numbers.';
export const strongEnough = pw => typeof pw === 'string' && pw.length >= 10 && /[a-z]/i.test(pw) && /\d/.test(pw);
