import { z } from 'zod';
import { badRequest } from './errors.js';

export { z };
/** Parses input against a zod schema; throws a 400 with a readable first message. */
export function parse(schema, input) {
  const r = schema.safeParse(input ?? {});
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  const field = issue.path.join('.');
  throw badRequest(issue.message && !/^Invalid input/.test(issue.message) ? issue.message : `Check the ${field || 'request'} field.`,
    r.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })));
}
export const phone10 = z.string().trim().transform(v => v.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, ''))
  .refine(v => /^[6-9]\d{9}$/.test(v), 'Enter a valid 10-digit mobile number.');
export const optPhone = z.union([z.literal(''), phone10]).optional().default('');
export const email = z.string().trim().toLowerCase().email('Enter a valid email address.');
export const optEmail = z.union([z.literal(''), email]).optional().default('');
export const text = (max, min = 0) => z.string().trim().max(max, `Keep it under ${max} characters.`).min(min, min ? 'This field is required.' : undefined);
export const bool = z.union([z.boolean(), z.literal(0), z.literal(1)]).transform(v => !!v);
export const intish = z.coerce.number().int();
export const money = z.coerce.number().int('Use whole rupees.').min(0, 'Amount cannot be negative.').max(1_000_000);
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour) time.');
export const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD dates.');
export const idList = z.array(z.coerce.number().int().positive()).max(200).default([]);
export const imageUrl = z.string().trim().max(500).refine(v => v === '' || /^(\/|assets\/|uploads\/|https:\/\/)/.test(v), 'Use an uploaded photo or an https:// link.');
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});
