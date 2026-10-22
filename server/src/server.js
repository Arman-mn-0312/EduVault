import 'dotenv/config';
import { loadConfig } from './config/env.js';
import { createApp } from './app.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = createApp({ config });
const server = app.listen(config.port, () => {
  console.log(`API listening on port ${config.port} (${config.nodeEnv})`);
  if (!config.supabase.isConfigured) {
    console.warn('Supabase is not configured (SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY). Auth and data routes will be unavailable.');
  }
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
