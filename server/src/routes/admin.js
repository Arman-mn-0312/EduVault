import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { accountStatusSchema, adminDocumentListSchema, adminListSchema, moderationSchema, reportStatusSchema } from '../validators/admin.js';
import { metadataOptionCreateSchema, metadataOptionListSchema, metadataOptionUpdateSchema } from '../validators/metadataOptions.js';
import * as repository from '../repositories/adminRepository.js';
import * as service from '../services/adminService.js';
import * as metadataOptionsService from '../services/metadataOptionsService.js';

function pageResult(result, map) {
  service.ensure(result, 'listing');
  return { items: (result.data || []).map(map), pagination: { page: result.page, limit: result.limit, total: result.count || 0, totalPages: Math.ceil((result.count || 0) / result.limit) } };
}

export function createAdminRouter({ authenticate, supabase, config }) {
  const router = Router();
  router.use(authenticate, requireRole('admin'));
  const db = () => supabase.adminClient();

  router.get('/overview', async (_req, res) => {
    const [students, documents, pending, approved, rejected, downloads] = await repository.dashboardCounts(db());
    [students, documents, pending, approved, rejected, downloads].forEach((result) => service.ensure(result, 'dashboard query'));
    const [uploads, popular, reports] = await Promise.all([repository.recentUploads(db()), repository.mostDownloaded(db()), repository.recentOpenReports(db())]);
    [uploads, popular, reports].forEach((result) => service.ensure(result, 'dashboard query'));
    res.json({ stats: { students: students.count || 0, documents: documents.count || 0, pending: pending.count || 0, approved: approved.count || 0, rejected: rejected.count || 0, downloads: downloads.count || 0 }, recentUploads: uploads.data || [], mostDownloaded: popular.data || [], recentReports: reports.data || [] });
  });

  router.get('/users', validate(adminListSchema, 'query'), async (req, res) => {
    const result = await repository.listUsers(db(), req.valid.query);
    result.page = req.valid.query.page; result.limit = req.valid.query.limit;
    res.json(pageResult(result, service.dtoUser));
  });
  router.patch('/users/:id/status', validate(accountStatusSchema), async (req, res) => {
    res.json({ user: await service.suspendOrReactivate({ db: db(), supabase, actor: req.auth.profile, id: req.params.id, status: req.valid.body.status }) });
  });

  router.get('/documents', validate(adminDocumentListSchema, 'query'), async (req, res) => {
    const result = await repository.listDocuments(db(), req.valid.query);
    result.page = req.valid.query.page; result.limit = req.valid.query.limit;
    res.json(pageResult(result, service.dtoDocument));
  });
  router.get('/metadata-options', validate(metadataOptionListSchema, 'query'), async (req, res) => {
    res.json({ options: await metadataOptionsService.list({ db: db(), ...req.valid.query, includeInactive: true }) });
  });
  router.post('/metadata-options', validate(metadataOptionCreateSchema), async (req, res) => {
    const option = await metadataOptionsService.create({ db: db(), supabase, actor: req.auth.profile, ...req.valid.body });
    res.status(201).json({ option });
  });
  router.patch('/metadata-options/:id', validate(metadataOptionUpdateSchema), async (req, res) => {
    const option = await metadataOptionsService.update({ db: db(), supabase, actor: req.auth.profile, id: req.params.id, payload: req.valid.body });
    res.json({ option });
  });
  router.delete('/metadata-options/:id', async (req, res) => {
    const option = await metadataOptionsService.update({ db: db(), supabase, actor: req.auth.profile, id: req.params.id, payload: { isActive: false } });
    res.json({ option });
  });
  router.patch('/documents/:id/moderation', validate(moderationSchema), async (req, res) => {
    res.json({ document: await service.moderateDocument({ db: db(), supabase, actor: req.auth.profile, id: req.params.id, ...req.valid.body }) });
  });
  router.delete('/documents/:id', async (req, res) => {
    await service.removeDocument({ db: db(), supabase, config, actor: req.auth.profile, id: req.params.id });
    res.status(204).end();
  });

  router.get('/reports', validate(adminListSchema, 'query'), async (req, res) => {
    const result = await repository.listReports(db(), req.valid.query);
    result.page = req.valid.query.page; result.limit = req.valid.query.limit;
    res.json(pageResult(result, service.dtoReport));
  });
  router.patch('/reports/:id', validate(reportStatusSchema), async (req, res) => {
    res.json({ report: await service.reviewReport({ db: db(), supabase, actor: req.auth.profile, id: req.params.id, status: req.valid.body.status }) });
  });

  router.get('/audit-logs', validate(adminListSchema, 'query'), async (req, res) => {
    const result = await repository.listAuditLogs(db(), req.valid.query);
    result.page = req.valid.query.page; result.limit = req.valid.query.limit;
    res.json(pageResult(result, (row) => ({ id: row.id, actorName: row.actor?.full_name || 'System', actorEmail: row.actor?.email || null, action: row.action, targetType: row.target_type, targetId: row.target_id, details: row.details, createdAt: row.created_at })));
  });
  return router;
}
