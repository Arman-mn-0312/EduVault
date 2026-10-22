import { Router } from 'express';

export function createHealthRouter(config) {
  const router = Router();

  // Never exposes keys or URLs, only booleans.
  router.get('/', (_req, res) => {
    res.json({
      status: 'ok',
      env: config.nodeEnv,
      uptimeSeconds: Math.round(process.uptime()),
      time: new Date().toISOString(),
      supabase: {
        configured: config.supabase.isConfigured,
        serviceRoleConfigured: config.supabase.hasServiceRole,
      },
      uploads: {
        maxFileSizeMb: config.upload.maxFileSizeMb,
        moderationEnabled: config.upload.moderationEnabled,
      },
    });
  });

  return router;
}
