const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Promotes an EXISTING registered student to administrator. `admin` must be a service-role
 * Supabase client: only trusted roles may change profiles.role (enforced by a DB trigger).
 * Writes an audit row (actor NULL = CLI/system). If the audit write fails, the promotion is
 * reverted so there is never an unlogged admin.
 */
export async function promoteToAdmin({ admin, email }) {
  const normalized = String(email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) throw new Error('A valid --email is required.');

  const found = await admin.from('profiles').select('id, role, status').eq('email', normalized).maybeSingle();
  if (found.error) throw new Error(`Could not look up the user: ${found.error.message}`);
  const profile = found.data;
  if (!profile) throw new Error('No registered user has that email. The person must register first.');
  if (profile.status !== 'active') throw new Error('That account is suspended. Reactivate it before promoting.');
  if (profile.role === 'admin') return { changed: false, userId: profile.id };

  const updated = await admin.from('profiles').update({ role: 'admin' }).eq('id', profile.id).select('id').maybeSingle();
  if (updated.error || !updated.data) {
    throw new Error(`Promotion failed: ${updated.error?.message ?? 'no row updated'}`);
  }

  const audit = await admin.from('admin_audit_logs').insert({
    actor_id: null,
    action: 'admin.provision',
    target_type: 'profile',
    target_id: profile.id,
    details: { via: 'cli' },
  });
  if (audit.error) {
    const revert = await admin.from('profiles').update({ role: 'student' }).eq('id', profile.id).select('id').maybeSingle();
    if (revert.error || !revert.data) {
      throw new Error(
        `Audit log write failed (${audit.error.message}) AND the revert failed. ` +
          `User ${profile.id} is now an admin without an audit row. Fix this manually.`
      );
    }
    throw new Error(`Audit log write failed, promotion reverted: ${audit.error.message}`);
  }
  return { changed: true, userId: profile.id };
}
