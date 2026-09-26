import { HttpError } from '../lib/errors.js';
import { log } from '../lib/logger.js';

export function notFoundApi(req, res) { res.status(404).json({ error: 'API endpoint not found.' }); }
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'That request is too large.' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body is not valid JSON.' });
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'That file is too large.' });
  if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'That already exists. Use a different name or code.' });
  if (String(err?.code || '').startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'This change conflicts with related records.' });
  log.error('unhandled error', { method: req.method, path: req.path, error: err?.message, stack: err?.stack?.split('\n').slice(0, 5).join(' | ') });
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
}
