import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers.js';
import { allowedDocuments, validateDocumentFile } from '../src/validators/documents.js';
import { createErrorHandler } from '../src/middleware/errorHandler.js';
import express from 'express';

const user = { id: 'u-alice', email: 'alice@uni.test' };
const profile = {
  id: user.id, full_name: 'Alice', email: user.email, role: 'student', status: 'active', created_at: '2026-01-01T00:00:00Z',
};

function officeFile(extension, valid = true) {
  const mimeType = allowedDocuments[extension];
  const signature = extension.endsWith('x') ? Buffer.from(`PK\x03\x04 [Content_Types].xml ${extension === 'pptx' ? 'ppt/' : 'word/'}`) : Buffer.from('d0cf11e0a1b11ae1', 'hex');
  return { originalname: `notes.${extension}`, mimetype: mimeType, buffer: valid ? signature : Buffer.from('not-an-office-file'), size: signature.length };
}

function makeSupabase({ storageFailure = false, insertFailure = false, initialDocuments = [] } = {}) {
  const documents = [...initialDocuments];
  const storage = {
    uploaded: [],
    removed: [],
    async upload(path, buffer, options) {
      if (storageFailure) return { error: { message: 'storage unavailable' } };
      this.uploaded.push({ path, buffer, options });
      return { data: { path }, error: null };
    },
    async remove(paths) {
      this.removed.push(...paths);
      return { data: paths.map((path) => ({ name: path })), error: null };
    },
  };
  const query = (table) => {
    const state = { operation: 'select', payload: null, filters: {} };
    const api = {
      select() { return api; },
      insert(payload) { state.operation = 'insert'; state.payload = payload; return api; },
      update(payload) { state.operation = 'update'; state.payload = payload; return api; },
      delete() { state.operation = 'delete'; return api; },
      eq(key, value) { state.filters[key] = value; return api; },
      order() { return Promise.resolve({ data: documents.filter((row) => row.uploader_id === state.filters.uploader_id), error: null }); },
      async maybeSingle() {
        if (table === 'profiles') return { data: profile, error: null };
        if (state.operation === 'insert') {
          if (insertFailure) return { data: null, error: { message: 'database unavailable' } };
          documents.push({ ...state.payload, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });
          return { data: { ...documents.at(-1) }, error: null };
        }
        const row = documents.find((item) => item.id === state.filters.id && item.uploader_id === state.filters.uploader_id);
        if (state.operation === 'update' && row) Object.assign(row, state.payload);
        return { data: row ? { ...row } : null, error: null };
      },
      async then(resolve) {
        const row = documents.find((item) => item.id === state.filters.id && item.uploader_id === state.filters.uploader_id);
        if (state.operation === 'delete' && row) documents.splice(documents.indexOf(row), 1);
        resolve({ data: null, error: null });
      },
    };
    return api;
  };
  return {
    isConfigured: true,
    hasServiceRole: true,
    storage,
    async verifyToken(token) { return token === 'alice-token' ? user : null; },
    userClient() { return { from: query }; },
    adminClient() {
      return {
        storage: { from: () => storage },
        from: () => query('documents'),
      };
    },
  };
}

const auth = { Authorization: 'Bearer alice-token' };

describe('document validation', () => {
  it('rejects spoofed signatures and unsupported extensions', () => {
    expect(validateDocumentFile(officeFile('docx', false), 25 * 1024 * 1024)).toBeTruthy();
    expect(validateDocumentFile({ ...officeFile('pdf'), originalname: 'notes.pdf' }, 25 * 1024 * 1024)).toBeTruthy();
  });

  it('accepts matching legacy and zipped Office signatures', () => {
    expect(validateDocumentFile(officeFile('doc'), 25 * 1024 * 1024)).toBeNull();
    expect(validateDocumentFile(officeFile('pptx'), 25 * 1024 * 1024)).toBeNull();
  });
});

describe('document upload permissions and rollback', () => {
  it('requires authentication before accepting uploads', async () => {
    const app = buildTestApp({}, { supabase: makeSupabase() }).app;
    const response = await request(app).post('/api/documents').attach('file', officeFile('doc').buffer, { filename: 'notes.doc', contentType: allowedDocuments.doc });
    expect(response.status).toBe(401);
  });

  it('stores an owner-scoped pending document and removes storage when the database fails', async () => {
    const supabase = makeSupabase({ insertFailure: true });
    const app = buildTestApp({}, { supabase }).app;
    const response = await request(app).post('/api/documents').set(auth)
      .field('title', 'Notes').field('subject', 'Math')
      .attach('file', officeFile('doc').buffer, { filename: 'notes.doc', contentType: allowedDocuments.doc });
    expect(response.status).toBe(500);
    expect(supabase.storage.uploaded).toHaveLength(1);
    expect(supabase.storage.removed).toHaveLength(1);
  });

  it('returns a pending document when moderation is enabled', async () => {
    const supabase = makeSupabase();
    const app = buildTestApp({}, { supabase }).app;
    const response = await request(app).post('/api/documents').set(auth)
      .field('title', 'Notes').field('subject', 'Math')
      .attach('file', officeFile('doc').buffer, { filename: 'notes.doc', contentType: allowedDocuments.doc });
    expect(response.status).toBe(201);
    expect(response.body.document.status).toBe('pending');
    expect(response.body.document.originalFilename).toBe('notes.doc');
  });

  it('rejects invalid files without uploading them', async () => {
    const supabase = makeSupabase();
    const app = buildTestApp({}, { supabase }).app;
    const response = await request(app).post('/api/documents').set(auth)
      .field('title', 'Notes').field('subject', 'Math')
      .attach('file', officeFile('doc', false).buffer, { filename: 'notes.doc', contentType: allowedDocuments.doc });
    expect(response.status).toBe(400);
    expect(supabase.storage.uploaded).toHaveLength(0);
  });

  it('does not allow an owner to change moderation fields', async () => {
    const document = { ...officeFile('doc'), id: 'doc-1', uploader_id: user.id, title: 'Notes', subject: 'Math', status: 'pending' };
    const app = buildTestApp({}, { supabase: makeSupabase({ initialDocuments: [document] }) }).app;
    const response = await request(app).patch('/api/documents/doc-1').set(auth).send({ status: 'approved' });
    expect(response.status).toBe(400);
  });

  it('does not expose or delete another uploader’s document', async () => {
    const document = { id: 'doc-2', uploader_id: 'u-other', storage_path: 'u-other/doc-2.doc', title: 'Other', subject: 'Math', status: 'pending' };
    const supabase = makeSupabase({ initialDocuments: [document] });
    const app = buildTestApp({}, { supabase }).app;
    const response = await request(app).delete('/api/documents/doc-2').set(auth);
    expect(response.status).toBe(404);
    expect(supabase.storage.removed).toHaveLength(0);
  });

  it('returns a forbidden response for a valid user with no profile', async () => {
    const supabase = makeSupabase();
    supabase.verifyToken = async () => ({ id: 'other', email: 'other@uni.test' });
    const app = express();
    const { createAuthMiddleware } = await import('../src/middleware/auth.js');
    const { authenticate } = createAuthMiddleware({ supabase: { ...supabase, userClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) } });
    app.post('/upload', authenticate, (_req, res) => res.json({ ok: true }));
    app.use(createErrorHandler({ isTest: true }));
    expect((await request(app).post('/upload').set(auth)).status).toBe(403);
  });
});
