import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config/env.js';

describe('loadConfig', () => {
  it('applies defaults, including the 25 MB upload cap', () => {
    const c = loadConfig({});
    expect(c.port).toBe(4000);
    expect(c.upload.maxFileSizeBytes).toBe(25 * 1024 * 1024);
    expect(c.upload.moderationEnabled).toBe(true);
    expect(c.supabase.isConfigured).toBe(false);
    expect(c.supabase.bucket).toBe('documents');
  });

  it('treats empty-string Supabase vars as unset', () => {
    const c = loadConfig({ SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '', SUPABASE_SECRET_KEY: '' });
    expect(c.supabase.isConfigured).toBe(false);
    expect(c.supabase.hasServiceRole).toBe(false);
  });

  it('rejects invalid values with a readable message', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ MAX_FILE_SIZE_MB: '-5' })).toThrow(/MAX_FILE_SIZE_MB/);
    expect(() => loadConfig({ SUPABASE_URL: 'not-a-url' })).toThrow(/SUPABASE_URL/);
  });

  it('parses a comma-separated CLIENT_ORIGIN list and moderation flag', () => {
    const c = loadConfig({ CLIENT_ORIGIN: 'http://a.test, https://b.test', MODERATION_ENABLED: 'false' });
    expect(c.clientOrigins).toEqual(['http://a.test', 'https://b.test']);
    expect(c.upload.moderationEnabled).toBe(false);
  });

  it('config is frozen', () => {
    const c = loadConfig({});
    expect(() => { c.port = 1; }).toThrow();
  });
});
