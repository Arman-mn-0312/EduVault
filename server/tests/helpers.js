import { loadConfig } from '../src/config/env.js';
import { createApp } from '../src/app.js';

export function buildTestApp(overrides = {}, { supabase } = {}) {
  const config = loadConfig({ NODE_ENV: 'test', ...overrides });
  return { app: createApp({ config, ...(supabase ? { supabase } : {}) }), config };
}
