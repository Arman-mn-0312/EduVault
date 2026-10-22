const COLUMNS = 'id, full_name, email, role, status, created_at';

/** `db` is a Supabase client. For user data pass the user-scoped client so RLS applies. */
export function getById(db, id) {
  return db.from('profiles').select(COLUMNS).eq('id', id).maybeSingle();
}

export function updateFullName(db, id, fullName) {
  // Only full_name is ever sent. role/status/email are never taken from request input.
  return db.from('profiles').update({ full_name: fullName }).eq('id', id).select(COLUMNS).maybeSingle();
}
