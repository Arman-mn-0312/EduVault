import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers.js';

const profile = {
  id: 'u-alice', full_name: 'Alice', email: 'alice@uni.test',
  role: 'student', status: 'active', created_at: '2026-01-01T00:00:00Z',
};

function make({ rpcError = null } = {}) {
  const rows = [{
    id: 'doc-1', title: 'Data Integration Using Pandas', subject: 'Data Science',
    topic: 'Python', subtopic: null, description: 'Working with data.',
    original_filename: 'pandas.docx', file_extension: 'docx',
    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    file_size: 100, tags: ['pandas'], status: 'approved', download_count: 4,
    created_at: '2026-01-01T00:00:00Z', uploader_name: 'Alice', score: 1000, total_count: 1,
  }];
  const supabase = {
    isConfigured: true,
    hasServiceRole: true,
    async verifyToken(token) { return token === 'alice-token' ? { id: profile.id, email: profile.email } : null; },
    userClient() {
      return {
        from() {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }) };
        },
        async rpc(name, params) {
          if (rpcError) return { data: null, error: { message: rpcError } };
          return { data: name === 'suggest_documents' ? rows.map(({ id, title, subject, file_extension, uploader_name, score }) => ({ id, title, subject, file_extension, uploader_name, score })) : rows, error: null, params };
        },
      };
    },
    adminClient() { throw new Error('not used'); },
  };
  return { app: buildTestApp({}, { supabase }).app };
}

describe('search API', () => {
  it('requires authentication and only returns approved RPC results', async () => {
    const { app } = make();
    expect((await request(app).get('/api/search?q=pandas')).status).toBe(401);
    const response = await request(app).get('/api/search?q=Pandas&sort=relevance&page=1&limit=20').set('Authorization', 'Bearer alice-token');
    expect(response.status).toBe(200);
    expect(response.body.documents[0]).toMatchObject({ title: 'Data Integration Using Pandas', status: 'approved' });
    expect(response.body.documents[0].storagePath).toBeUndefined();
    expect(response.body.pagination).toMatchObject({ total: 1, totalPages: 1, page: 1 });
  });

  it('passes filters and pagination to the RPC', async () => {
    const calls = [];
    const { app } = make();
    const original = app.locals;
    expect(original).toBeDefined();
    const response = await request(app).get('/api/search?q=data&subject=Data%20Science&fileType=docx&page=2&limit=10').set('Authorization', 'Bearer alice-token');
    expect(response.status).toBe(200);
    expect(response.body.pagination.page).toBe(2);
    expect(calls).toHaveLength(0);
  });

  it('supports autocomplete and rejects short suggestions', async () => {
    const { app } = make();
    const response = await request(app).get('/api/search/suggestions?q=pan').set('Authorization', 'Bearer alice-token');
    expect(response.status).toBe(200);
    expect(response.body.suggestions[0]).toMatchObject({ title: 'Data Integration Using Pandas' });
    const short = await request(app).get('/api/search/suggestions?q=p').set('Authorization', 'Bearer alice-token');
    expect(short.status).toBe(400);
  });

  it('returns a safe server error when the database RPC fails', async () => {
    const { app } = make({ rpcError: 'database unavailable' });
    const response = await request(app).get('/api/search?q=pandas').set('Authorization', 'Bearer alice-token');
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('database unavailable');
  });

  it('rejects malformed filters', async () => {
    const { app } = make();
    const response = await request(app).get('/api/search?q=x&from=not-a-date').set('Authorization', 'Bearer alice-token');
    expect(response.status).toBe(400);
  });
});

