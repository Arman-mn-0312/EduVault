/**
 * In-memory stand-in for the Supabase service used by the app. It models token -> user,
 * a profiles table, and records every write so tests can assert what reached the "database".
 * It does NOT simulate Postgres RLS/triggers; those are covered by supabase/tests (real Postgres).
 */
export function createFakeSupabase({ tokens = {}, profiles = {}, failProfileLookup = false, upstreamDown = false, isConfigured = true } = {}) {
  const writes = [];

  function builder(userId) {
    const q = { op: 'select', payload: null, filters: {} };
    const api = {
      select() { return api; },
      update(payload) { q.op = 'update'; q.payload = payload; return api; },
      eq(key, value) { q.filters[key] = value; return api; },
      async maybeSingle() {
        if (failProfileLookup) return { data: null, error: { message: 'connection refused to db.internal:5432' } };
        const row = profiles[q.filters.id];
        if (q.op === 'select') return { data: row ? { ...row } : null, error: null };
        writes.push({ userId, payload: q.payload, filters: { ...q.filters } });
        if (!row || q.filters.id !== userId) return { data: null, error: null }; // RLS: not your row
        Object.assign(row, q.payload);
        return { data: { ...row }, error: null };
      },
    };
    return api;
  }

  return {
    isConfigured,
    hasServiceRole: true,
    writes,
    async verifyToken(token) {
      if (upstreamDown) {
        const { AppError } = await import('../src/utils/AppError.js');
        throw new AppError(503, 'AUTH_UNAVAILABLE', 'Authentication service is unavailable. Try again shortly.');
      }
      return tokens[token] ?? null;
    },
    userClient(token) {
      const userId = tokens[token]?.id;
      return { from: () => builder(userId) };
    },
    adminClient() { throw new Error('adminClient must not be used by profile routes'); },
  };
}

export const ALICE = { id: 'u-alice', email: 'alice@uni.test' };
export const ADMIN = { id: 'u-admin', email: 'admin@uni.test' };

export function baseProfiles() {
  const mk = (u, name, role = 'student', status = 'active') => ({
    id: u.id, full_name: name, email: u.email, role, status, created_at: '2026-01-01T00:00:00Z',
  });
  return {
    [ALICE.id]: mk(ALICE, 'Alice'),
    [ADMIN.id]: mk(ADMIN, 'Admin', 'admin'),
    'u-sus': mk({ id: 'u-sus', email: 'sus@uni.test' }, 'Sus', 'student', 'suspended'),
  };
}
