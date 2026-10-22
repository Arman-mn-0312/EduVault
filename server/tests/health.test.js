import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers.js';

describe('GET /api/health', () => {
  it('returns ok and reports Supabase as unconfigured when no credentials exist', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.supabase).toEqual({ configured: false, serviceRoleConfigured: false });
  });

  it('reports configured flags without leaking secrets', async () => {
    const { app } = buildTestApp({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'publishable-test-value',
      SUPABASE_SECRET_KEY: 'secret-test-value',
    });
    const res = await request(app).get('/api/health');
    expect(res.body.supabase).toEqual({ configured: true, serviceRoleConfigured: true });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('secret-value');
    expect(raw).not.toContain('example.supabase.co');
  });

  it('sets security headers and hides x-powered-by', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
