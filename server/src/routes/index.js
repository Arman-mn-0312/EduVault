import { Router } from 'express';
import { createHealthRouter } from './health.js';
import { createProfileRouter } from './profile.js';
import { createAuthMiddleware } from '../middleware/auth.js';
import { createDocumentsRouter } from './documents.js';
import { createSearchRouter } from './search.js';
import { createAdminRouter } from './admin.js';

/** Central route registry. Later phases mount documents, search, admin here. */
export function createApiRouter({ config, limiters, supabase }) {
  const router = Router();
  const { authenticate } = createAuthMiddleware({ supabase });

  router.use('/health', createHealthRouter(config));
  router.use('/profile', createProfileRouter({ limiters, authenticate }));
  router.use('/documents', createDocumentsRouter({ config, limiters, authenticate, supabase }));
  router.use('/search', createSearchRouter({ limiters, authenticate }));
  router.use('/admin', createAdminRouter({ authenticate, supabase, config }));
  return router;
}
