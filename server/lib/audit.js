// Write-behind audit trail for admin mutations. Never throws into the
// request path - a failed audit write must not fail the user's action.
import { exec } from './db.js';

export async function audit(req, { action, entity, entityId = null, before = null, after = null }) {
  try {
    await exec(
      `INSERT INTO audit_log (actor_id, actor_email, action, entity, entity_id, before_json, after_json, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.admin?.id ?? null,
        req.admin?.email ?? null,
        action,
        entity,
        entityId,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().slice(0, 45),
      ]
    );
  } catch (e) {
    console.warn('[audit] failed:', e.message);
  }
}
