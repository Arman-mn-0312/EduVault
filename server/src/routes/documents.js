import { Router } from 'express';
import multer from 'multer';
import { AppError } from '../utils/AppError.js';
import { validate } from '../middleware/validate.js';
import { documentMetadataSchema, documentUpdateSchema, mapMetadataAliases } from '../validators/documents.js';
import { documentReportSchema } from '../validators/reports.js';
import * as documentsRepository from '../repositories/documentsRepository.js';
import { downloadDocument, getDocumentDetails, toDocumentDto, uploadDocument } from '../services/documentService.js';
import * as metadataOptionsService from '../services/metadataOptionsService.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function uploadMiddleware(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return next(AppError.badRequest('The document exceeds the maximum file size.'));
    }
    return next(AppError.badRequest('The uploaded multipart request is invalid.'));
  });
}

function metadataFromBody(req, _res, next) {
  const body = { ...req.body };
  const tagsKey = body.tags === undefined ? 'tags_keywords' : 'tags';
  if (typeof body[tagsKey] === 'string') {
    try { body[tagsKey] = JSON.parse(body[tagsKey]); } catch { return next(AppError.badRequest('Tags must be a JSON array.')); }
  }
  req.body = mapMetadataAliases(body);
  return next();
}

function handleRepositoryError(error, action) {
  if (error) throw new Error(`document ${action} failed: ${error.message}`);
}

export function createDocumentsRouter({ config, limiters, authenticate, supabase }) {
  const router = Router();
  router.use(authenticate);

  router.get('/mine', async (req, res) => {
    const result = await documentsRepository.listMine(req.auth.db, req.auth.profile.id);
    handleRepositoryError(result.error, 'listing');
    res.json({ documents: (result.data || []).map(toDocumentDto) });
  });

  router.get('/metadata-options', async (req, res) => {
    const options = await metadataOptionsService.list({
      db: supabase.adminClient(), includeInactive: false,
    });
    res.json({ options });
  });

  router.get('/:id', async (req, res) => {
    res.json({ document: await getDocumentDetails({ db: req.auth.db, id: req.params.id, profile: req.auth.profile }) });
  });

  router.post('/:id/download', limiters.download, async (req, res) => {
    const download = await downloadDocument({
      db: req.auth.db,
      supabase,
      config,
      id: req.params.id,
      userId: req.auth.profile.id,
    });
    res.json({ download });
  });

  router.post('/:id/reports', limiters.report, validate(documentReportSchema), async (req, res) => {
    const visible = await documentsRepository.getVisible(req.auth.db, req.params.id);
    handleRepositoryError(visible.error, 'lookup');
    if (!visible.data) throw AppError.notFound('Document not found.');
    const result = await documentsRepository.createReport(req.auth.db, {
      document_id: req.params.id,
      reporter_id: req.auth.profile.id,
      reason: req.valid.body.reason,
      details: req.valid.body.details || null,
    });
    handleRepositoryError(result.error, 'report submission');
    if (!result.data) throw new Error('document report submission returned no row');
    res.status(201).json({ report: { id: result.data.id, createdAt: result.data.created_at } });
  });

  router.post('/', limiters.upload, uploadMiddleware, metadataFromBody, validate(documentMetadataSchema), async (req, res) => {
    await metadataOptionsService.validateDocumentMetadata({
      db: supabase.adminClient(), metadata: req.valid.body,
    });
    const document = await uploadDocument({ req, supabase, config, metadata: req.valid.body });
    res.status(201).json({ document });
  });

  router.patch('/:id', metadataFromBody, validate(documentUpdateSchema), async (req, res) => {
    const current = await documentsRepository.getOwn(req.auth.db, req.params.id, req.auth.profile.id);
    handleRepositoryError(current.error, 'lookup');
    if (!current.data) throw AppError.notFound('Document not found.');
    await metadataOptionsService.validateDocumentMetadata({
      db: supabase.adminClient(), metadata: req.valid.body, existing: current.data, allowInactiveExisting: true,
    });
    const result = await documentsRepository.updateOwn(req.auth.db, req.params.id, req.auth.profile.id, req.valid.body);
    handleRepositoryError(result.error, 'update');
    if (!result.data) throw AppError.notFound('Document not found.');
    res.json({ document: toDocumentDto(result.data) });
  });

  router.delete('/:id', async (req, res) => {
    const current = await documentsRepository.getOwn(req.auth.db, req.params.id, req.auth.profile.id);
    handleRepositoryError(current.error, 'lookup');
    if (!current.data) throw AppError.notFound('Document not found.');

    const result = await documentsRepository.deleteOwn(req.auth.db, req.params.id, req.auth.profile.id);
    handleRepositoryError(result.error, 'deletion');
    const storage = supabase.adminClient().storage.from(config.supabase.bucket);
    const removed = await storage.remove([current.data.storage_path]);
    if (removed.error) {
      console.error(`[error] document storage cleanup failed: ${removed.error.message}`);
      throw new Error(`document storage cleanup failed: ${removed.error.message}`);
    }
    res.status(204).end();
  });

  return router;
}
