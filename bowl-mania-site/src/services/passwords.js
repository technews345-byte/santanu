import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scryptAsync = promisify(scrypt);
const N = 16384, R = 8, P = 1, LEN = 64;

/** scrypt hash stored as scrypt$N$r$p$salt$hash (base64url). Plain passwords are never stored. */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(String(password).normalize('NFKC'), salt, LEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}
export async function verifyPassword(password, stored) {
  const [alg, n, r, p, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await scryptAsync(String(password).normalize('NFKC'), Buffer.from(salt, 'base64url'), expected.length, { N: +n, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(key, expected);
}
export const passwordRule = 'Use at least 10 characters with letters and numbers.';
export const strongEnough = pw => typeof pw === 'string' && pw.length >= 10 && /[a-z]/i.test(pw) && /\d/.test(pw);
