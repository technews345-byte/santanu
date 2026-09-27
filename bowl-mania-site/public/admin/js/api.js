// Fetch wrapper: cookies for auth, CSRF header on writes, one transparent session refresh on 401.
export class ApiError extends Error { constructor(status, message, details) { super(message); this.status = status; this.details = details; } }
const csrf = () => decodeURIComponent(document.cookie.match(/(?:^|; )bm_csrf=([^;]+)/)?.[1] || '');
let refreshing = null;
export const onSignedOut = { fn: () => {} };

export async function api(path, { method = 'GET', body, query } = {}) {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)).toString() : '';
  const go = () => fetch('/api' + path + qs, {
    method, credentials: 'same-origin',
    headers: { ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-CSRF-Token': csrf() } : {}) },
    body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined
  });
  let r;
  try { r = await go(); } catch { throw new ApiError(0, 'Cannot reach the server. Check your internet connection.'); }
  if (r.status === 401 && !path.startsWith('/auth/login')) {
    refreshing ||= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' }).then(x => x.ok).finally(() => setTimeout(() => { refreshing = null; }, 100));
    if (await refreshing) r = await go();
    else { onSignedOut.fn(); throw new ApiError(401, 'Your session has expired. Please sign in again.'); }
  }
  const type = r.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await r.json().catch(() => ({})) : null;
  if (!r.ok) throw new ApiError(r.status, data?.error || `Request failed (${r.status}).`, data?.details);
  return data;
}
export const get = (p, query) => api(p, { query });
export const post = (p, body) => api(p, { method: 'POST', body: body ?? {} });
export const patch = (p, body) => api(p, { method: 'PATCH', body });
export const put = (p, body) => api(p, { method: 'PUT', body });
export const del = p => api(p, { method: 'DELETE' });
