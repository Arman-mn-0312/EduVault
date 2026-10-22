import { describe, it, expect, vi } from 'vitest';
import { promoteToAdmin } from '../src/services/adminProvisioning.js';

/** Minimal chainable fake of the service-role client. */
function fakeAdmin({ profile, updateResult, auditError } = {}) {
  const calls = { updates: [], audits: [] };
  const from = vi.fn((table) => {
    if (table === 'admin_audit_logs') {
      return { insert: async (row) => { calls.audits.push(row); return { error: auditError ?? null }; } };
    }
    const state = { op: 'select', payload: null };
    const api = {
      select: () => api,
      eq: () => api,
      update: (p) => { state.op = 'update'; state.payload = p; return api; },
      maybeSingle: async () => {
        if (state.op === 'select') return { data: profile ?? null, error: null };
        calls.updates.push(state.payload);
        return updateResult ?? { data: { id: profile?.id }, error: null };
      },
    };
    return api;
  });
  return { client: { from }, calls };
}

describe('promoteToAdmin', () => {
  const student = { id: 'u1', role: 'student', status: 'active' };

  it('promotes an existing student and writes an audit row with a null actor', async () => {
    const { client, calls } = fakeAdmin({ profile: student });
    const r = await promoteToAdmin({ admin: client, email: ' Alice@Uni.test ' });
    expect(r).toEqual({ changed: true, userId: 'u1' });
    expect(calls.updates).toEqual([{ role: 'admin' }]);
    expect(calls.audits).toEqual([{ actor_id: null, action: 'admin.provision', target_type: 'profile', target_id: 'u1', details: { via: 'cli' } }]);
    expect(JSON.stringify(calls.audits)).not.toContain('uni.test'); // no email in audit details
  });

  it('is a no-op for existing admins', async () => {
    const { client, calls } = fakeAdmin({ profile: { ...student, role: 'admin' } });
    expect(await promoteToAdmin({ admin: client, email: 'a@b.co' })).toEqual({ changed: false, userId: 'u1' });
    expect(calls.updates).toHaveLength(0);
    expect(calls.audits).toHaveLength(0);
  });

  it('refuses unknown users, suspended users, and invalid emails', async () => {
    await expect(promoteToAdmin({ admin: fakeAdmin({ profile: null }).client, email: 'a@b.co' })).rejects.toThrow(/must register first/);
    await expect(promoteToAdmin({ admin: fakeAdmin({ profile: { ...student, status: 'suspended' } }).client, email: 'a@b.co' })).rejects.toThrow(/suspended/);
    for (const bad of [undefined, '', 'not-an-email', 'a@b']) {
      await expect(promoteToAdmin({ admin: fakeAdmin({ profile: student }).client, email: bad })).rejects.toThrow(/valid --email/);
    }
  });

  it('reverts the promotion when the audit write fails', async () => {
    const { client, calls } = fakeAdmin({ profile: student, auditError: { message: 'insert denied' } });
    await expect(promoteToAdmin({ admin: client, email: 'a@b.co' })).rejects.toThrow(/promotion reverted/);
    expect(calls.updates).toEqual([{ role: 'admin' }, { role: 'student' }]);
  });

  it('says so explicitly when the revert also fails', async () => {
    let n = 0;
    const { client, calls } = fakeAdmin({ profile: student, auditError: { message: 'insert denied' } });
    const realFrom = client.from;
    client.from = (t) => {
      const api = realFrom(t);
      if (t !== 'profiles') return api;
      const mm = api.maybeSingle;
      api.maybeSingle = async () => (++n === 3 ? { data: null, error: { message: 'revert denied' } } : mm());
      return api;
    };
    await expect(promoteToAdmin({ admin: client, email: 'a@b.co' })).rejects.toThrow(/revert failed.*Fix this manually/);
    expect(calls.audits).toHaveLength(1);
  });

  it('fails loudly when the update changes nothing', async () => {
    const { client, calls } = fakeAdmin({ profile: student, updateResult: { data: null, error: null } });
    await expect(promoteToAdmin({ admin: client, email: 'a@b.co' })).rejects.toThrow(/Promotion failed/);
    expect(calls.audits).toHaveLength(0);
  });
});
