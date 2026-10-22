import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers.js';
import * as repository from '../src/repositories/adminRepository.js';
import { removeDocument, moderateDocument, suspendOrReactivate } from '../src/services/adminService.js';

vi.mock('../src/repositories/adminRepository.js', () => ({
  getUser: vi.fn(), countActiveAdmins: vi.fn(), updateUserStatus: vi.fn(), insertAudit: vi.fn(),
  getDocument: vi.fn(), updateDocumentModeration: vi.fn(), deleteDocument: vi.fn(),
  getReport: vi.fn(), updateReport: vi.fn(),
}));

const student = { id: 'u-student', email: 'student@uni.test' };
const admin = { id: 'u-admin', email: 'admin@uni.test' };
const profiles = {
  [student.id]: { id: student.id, full_name: 'Student', email: student.email, role: 'student', status: 'active' },
  [admin.id]: { id: admin.id, full_name: 'Admin', email: admin.email, role: 'admin', status: 'active' },
};

function supabase() {
  return {
    isConfigured: true,
    hasServiceRole: true,
    verifyToken: vi.fn(async (token) => token === 'admin-token' ? admin : token === 'student-token' ? student : null),
    userClient: (token) => {
      const profile = token === 'admin-token' ? profiles[admin.id] : profiles[student.id];
      return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }) }) };
    },
    adminClient: vi.fn(() => ({ storage: { from: () => ({ remove: vi.fn(async () => ({ error: null })) }) } })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repository.insertAudit.mockResolvedValue({ data: { id: 1 }, error: null });
});

describe('admin authorization and safeguards', () => {
  it('denies students before any privileged admin query', async () => {
    const app = buildTestApp({}, { supabase: supabase() }).app;
    const response = await request(app).get('/api/admin/overview').set('Authorization', 'Bearer student-token');
    expect(response.status).toBe(403);
  });

  it('denies unauthenticated admin access', async () => {
    const app = buildTestApp({}, { supabase: supabase() }).app;
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
  });

  it('prevents suspending the last active administrator', async () => {
    repository.getUser.mockResolvedValue({ data: { ...profiles[admin.id] }, error: null });
    repository.countActiveAdmins.mockResolvedValue({ count: 1, error: null });
    await expect(suspendOrReactivate({ db: {}, supabase: supabase(), actor: { id: student.id }, id: admin.id, status: 'suspended' })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(repository.updateUserStatus).not.toHaveBeenCalled();
  });

  it('audits moderation and does not expose storage paths', async () => {
    repository.getDocument.mockResolvedValue({ data: { id: 'd1', title: 'Notes', storage_path: 'private/d1', status: 'pending' }, error: null });
    repository.updateDocumentModeration.mockResolvedValue({ data: { id: 'd1', title: 'Notes', status: 'approved', download_count: 0 }, error: null });
    const result = await moderateDocument({ db: {}, supabase: supabase(), actor: { id: admin.id }, id: 'd1', status: 'approved' });
    expect(result).not.toHaveProperty('storagePath');
    expect(repository.insertAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'document_approved', target_id: 'd1' }));
  });

  it('stops removal when Storage cleanup fails', async () => {
    const storageError = supabase();
    storageError.adminClient.mockReturnValue({ storage: { from: () => ({ remove: vi.fn(async () => ({ error: { message: 'storage offline' } })) }) } });
    repository.getDocument.mockResolvedValue({ data: { id: 'd1', title: 'Notes', storage_path: 'private/d1' }, error: null });
    await expect(removeDocument({ db: {}, supabase: storageError, config: { supabase: { bucket: 'documents' } }, actor: { id: admin.id }, id: 'd1' })).rejects.toThrow(/storage removal/);
    expect(repository.deleteDocument).not.toHaveBeenCalled();
    expect(repository.insertAudit).not.toHaveBeenCalled();
  });
});
