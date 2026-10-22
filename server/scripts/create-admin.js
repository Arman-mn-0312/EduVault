#!/usr/bin/env node
/**
 * First-admin provisioning.
 *   cd server && node scripts/create-admin.js --email you@college.edu
 * Needs SUPABASE_URL and SUPABASE_SECRET_KEY (from server/.env or the shell).
 * The person must already have registered through the app.
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { loadConfig } from '../src/config/env.js';
import { promoteToAdmin } from '../src/services/adminProvisioning.js';

const { values } = parseArgs({ options: { email: { type: 'string' } } });

try {
  const config = loadConfig();
  if (!config.supabase.hasServiceRole) {
    throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set.');
  }
  const admin = createClient(config.supabase.url, config.supabase.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await promoteToAdmin({ admin, email: values.email });
  console.log(result.changed ? `Promoted user ${result.userId} to admin.` : `User ${result.userId} is already an admin. No change.`);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
