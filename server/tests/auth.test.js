import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { buildTestApp } from './helpers.js';
import { createFakeSupabase, baseProfiles, ALICE, ADMIN } from './fakeSupabase.js';
import { createAuthMiddleware, requireRole } from '../src/middleware/auth.js';
import { createErrorHandler } from '../src/middleware/errorHandler.js';
import { loadConfig } from '../src/config/env.js';

const tokens = {
  'alice-token': ALICE,
  'admin-token': ADMIN,
  'sus-token': { id: 'u-sus', email: 'sus@uni.test' },
  'ghost-token': { id: 'u-ghost', email: 'ghost@uni.test' }, // valid auth user, no profile row
};
const make = (opts = {}) => {
  const supabase = createFakeSupabase({ tokens, profiles: baseProfiles(), ...opts });
  return { supabase, ...buildTestApp({}, { supabase }) };
};
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

describe('authentication', () => {
  it('rejects requests with no token (401)', async () => {
    const { app } = make();
    const res = await request(app).get('/api/profile');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects non-Bearer schemes and malformed headers', async () => {
    const { app } = make();
    for (const h of ['Basic abc', 'Bearer', 'Bearer a b', 'alice-token']) {
      const res = await request(app).get('/api/profile').set('Authorization', h);
      expect(res.status, h).toBe(401);
    }
  });

  it('rejects an invalid or expired token (401)', async () => {
    const { app } = make();
    const res = await request(app).get('/api/profile').set(bearer('forged'));
    expect(res.status).toBe(401);
  });

  it('returns 503 when Supabase is not configured', async () => {
    const { app } = make({ isConfigured: false });
    const res = await request(app).get('/api/profile').set(bearer('alice-token'));
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('returns 503 (not 401) when the auth provider itself is down', async () => {
    const { app } = make({ upstreamDown: true });
    const res = await request(app).get('/api/profile').set(bearer('alice-token'));
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AUTH_UNAVAILABLE');
  });

  it('returns the caller profile as a DTO', async () => {
    const { app } = make();
    const res = await request(app).get('/api/profile').set(bearer('alice-token'));
    expect(res.status).toBe(200);
    expect(res.body.profile).toEqual({
      id: ALICE.id, fullName: 'Alice', email: ALICE.email, role: 'student', status: 'active', createdAt: '2026-01-01T00:00:00Z',
    });
    expect(JSON.stringify(res.body)).not.toContain('alice-token');
  });

  it('blocks suspended accounts with ACCOUNT_SUSPENDED (403)', async () => {
    const { app } = make();
    const res = await request(app).get('/api/profile').set(bearer('sus-token'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('blocks authenticated users that have no profile row (403)', async () => {
    const { app } = make();
    const res = await request(app).get('/api/profile').set(bearer('ghost-token'));
    expect(res.status).toBe(403);
  });

  it('hides database error details behind a generic 500', async () => {
    const { app } = make({ failProfileLookup: true });
    const res = await request(app).get('/api/profile').set(bearer('alice-token'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('db.internal');
  });
});

describe('role-based authorization', () => {
  function appWithAdminRoute(supabase) {
    const app = express();
    const { authenticate } = createAuthMiddleware({ supabase });
    app.get('/admin-only', authenticate, requireRole('admin'), (req, res) => res.json({ ok: true, who: req.auth.profile.id }));
    app.use(createErrorHandler(loadConfig({ NODE_ENV: 'test' })));
    return app;
  }

  it('allows admins and forbids students (403)', async () => {
    const supabase = createFakeSupabase({ tokens, profiles: baseProfiles() });
    const app = appWithAdminRoute(supabase);
    expect((await request(app).get('/admin-only').set(bearer('admin-token'))).status).toBe(200);
    const denied = await request(app).get('/admin-only').set(bearer('alice-token'));
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');
    expect((await request(app).get('/admin-only')).status).toBe(401);
  });

  it('ignores admin claims in JWT metadata: role comes from the database only', async () => {
    const supabase = createFakeSupabase({ tokens, profiles: baseProfiles() });
    // Attacker edits their own user_metadata / app_metadata to say admin:
    tokens['alice-token'] = { ...ALICE, user_metadata: { role: 'admin' }, app_metadata: { role: 'admin' } };
    const app = appWithAdminRoute(supabase);
    const res = await request(app).get('/admin-only').set(bearer('alice-token'));
    expect(res.status).toBe(403);
    tokens['alice-token'] = ALICE;
  });

  it('suspended admins are blocked before the role check', async () => {
    const profiles = baseProfiles();
    profiles[ADMIN.id].status = 'suspended';
    const app = appWithAdminRoute(createFakeSupabase({ tokens, profiles }));
    const res = await request(app).get('/admin-only').set(bearer('admin-token'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });
});

describe('PATCH /api/profile', () => {
  it('updates only full_name, trimmed, for the token owner', async () => {
    const { app, supabase } = make();
    const res = await request(app).patch('/api/profile').set(bearer('alice-token')).send({ fullName: '  Alice Brown  ' });
    expect(res.status).toBe(200);
    expect(res.body.profile.fullName).toBe('Alice Brown');
    expect(supabase.writes).toEqual([{ userId: ALICE.id, payload: { full_name: 'Alice Brown' }, filters: { id: ALICE.id } }]);
  });

  it.each([
    ['role escalation', { fullName: 'A', role: 'admin' }],
    ['role only', { role: 'admin' }],
    ['status change', { fullName: 'A', status: 'active' }],
    ['email change', { fullName: 'A', email: 'x@y.z' }],
    ['targeting another id', { fullName: 'A', id: 'u-admin' }],
    ['empty name', { fullName: '   ' }],
    ['too long', { fullName: 'x'.repeat(101) }],
    ['wrong type', { fullName: 42 }],
    ['empty body', {}],
  ])('rejects %s with 400 and writes nothing', async (_label, body) => {
    const { app, supabase } = make();
    const res = await request(app).patch('/api/profile').set(bearer('alice-token')).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBeTruthy();
    expect(supabase.writes).toHaveLength(0);
  });

  it('requires authentication', async () => {
    const { app, supabase } = make();
    const res = await request(app).patch('/api/profile').send({ fullName: 'Nope' });
    expect(res.status).toBe(401);
    expect(supabase.writes).toHaveLength(0);
  });
});

describe('failed-auth throttling', () => {
  it('returns 429 after repeated failed attempts, while successful requests do not count', async () => {
    const { app } = make();
    for (let i = 0; i < 25; i++) await request(app).get('/api/profile').set(bearer('alice-token'));
    expect((await request(app).get('/api/profile').set(bearer('alice-token'))).status).toBe(200);

    let last;
    for (let i = 0; i < 21; i++) last = await request(app).get('/api/profile').set(bearer('forged'));
    expect(last.status).toBe(429);
    expect(last.body.error.code).toBe('AUTH_RATE_LIMITED');
  });
});
