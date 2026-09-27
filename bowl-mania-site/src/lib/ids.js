import { randomBytes, createHash } from 'node:crypto';
export const token = (bytes = 24) => randomBytes(bytes).toString('base64url');
export const sha256 = v => createHash('sha256').update(String(v)).digest('hex');
export const slugify = s => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'item';
