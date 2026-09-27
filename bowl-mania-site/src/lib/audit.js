import { db } from '../db/index.js';
const ins = () => db.prepare(`INSERT INTO audit_logs (admin_id, admin_name, action, entity, entity_id, summary, old_value, new_value, ip)
  VALUES (?,?,?,?,?,?,?,?,?)`);
const clean = v => v == null ? null : JSON.stringify(v, (k, x) => /password|token_hash|secret/i.test(k) ? undefined : x);
/** Records who changed what. `req` supplies the acting admin and IP; pass null for system actions. */
export function audit(req, action, entity, entityId, summary, oldValue, newValue) {
  ins().run(req?.admin?.id ?? null, req?.admin?.name ?? 'System', action, entity, entityId == null ? null : String(entityId),
    summary || '', clean(oldValue), clean(newValue), req?.ip ?? null);
}
/** Only the fields that changed, for compact audit entries. */
export function diff(before, after) {
  const o = {}, n = {};
  for (const k of Object.keys(after)) {
    if (JSON.stringify(before?.[k]) !== JSON.stringify(after[k])) { o[k] = before?.[k]; n[k] = after[k]; }
  }
  return [o, n, Object.keys(n)];
}
