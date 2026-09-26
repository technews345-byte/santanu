// Structured JSON logs (one line per event) so they can be shipped to any log service.
function write(level, msg, extra) {
  const line = { t: new Date().toISOString(), level, msg, ...extra };
  (level === 'error' ? console.error : console.log)(JSON.stringify(line));
}
export const log = {
  info: (msg, extra = {}) => write('info', msg, extra),
  warn: (msg, extra = {}) => write('warn', msg, extra),
  error: (msg, extra = {}) => write('error', msg, extra)
};
