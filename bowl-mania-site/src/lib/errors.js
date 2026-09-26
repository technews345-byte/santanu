export class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}
export const badRequest = (m, d) => new HttpError(400, m, d);
export const unauthorized = (m = 'Please sign in.') => new HttpError(401, m);
export const forbidden = (m = "You don't have permission to do that.") => new HttpError(403, m);
export const notFound = (m = 'Not found.') => new HttpError(404, m);
export const conflict = m => new HttpError(409, m);
/** Wraps an async route so thrown errors reach the central error handler. */
export const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
