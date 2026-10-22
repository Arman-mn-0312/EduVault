import { describe, expect, it, vi } from 'vitest';
import { downloadDocument, toDocumentDto } from '../src/services/documentService.js';
import * as documentsRepository from '../src/repositories/documentsRepository.js';

vi.mock('../src/repositories/documentsRepository.js', () => ({
  getVisible: vi.fn(),
  recordDownload: vi.fn(),
}));

const config = { supabase: { bucket: 'documents' }, signedUrlTtlSeconds: 60 };
const row = {
  id: 'doc-1', uploader_id: 'owner', title: 'Notes', original_filename: 'week 1.docx',
  storage_path: 'owner/doc-1.docx', file_extension: 'docx', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  file_size: 42, subject: 'Math', status: 'approved', download_count: 2,
};

function makeSupabase({ signed = { data: { signedUrl: 'https://private.example/signed' }, error: null }, rpc = { data: 3, error: null } } = {}) {
  const createSignedUrl = vi.fn(async () => signed);
  const rpcClient = { rpc: vi.fn(async () => rpc) };
  return {
    hasServiceRole: true,
    adminClient: vi.fn(() => ({ storage: { from: () => ({ createSignedUrl }) }, ...rpcClient })),
    createSignedUrl,
    rpcClient,
  };
}

describe('document details and secure downloads', () => {
  it('does not include the private storage path in document DTOs', () => {
    const dto = toDocumentDto(row, 'Alice');
    expect(dto).toMatchObject({ uploaderName: 'Alice', downloadCount: 2 });
    expect(dto).not.toHaveProperty('storagePath');
  });

  it('generates a short-lived signed URL and records one atomic download', async () => {
    documentsRepository.getVisible.mockResolvedValue({ data: row, error: null });
    documentsRepository.recordDownload.mockResolvedValue({ data: 3, error: null });
    const supabase = makeSupabase();
    const result = await downloadDocument({ db: {}, supabase, config, id: row.id, userId: 'student' });
    expect(result).toEqual({ url: 'https://private.example/signed', expiresIn: 60, downloadCount: 3 });
    expect(supabase.createSignedUrl).toHaveBeenCalledWith(row.storage_path, 60, { download: row.original_filename });
    expect(documentsRepository.recordDownload).toHaveBeenCalledWith(expect.anything(), row.id, 'student');
  });

  it('does not record a failed storage URL request', async () => {
    documentsRepository.getVisible.mockResolvedValue({ data: row, error: null });
    const supabase = makeSupabase({ signed: { data: null, error: { message: 'missing file' } } });
    await expect(downloadDocument({ db: {}, supabase, config, id: row.id, userId: 'student' })).rejects.toThrow(/signed URL generation failed/);
    expect(documentsRepository.recordDownload).not.toHaveBeenCalled();
  });

  it('does not return a URL when atomic tracking fails', async () => {
    documentsRepository.getVisible.mockResolvedValue({ data: row, error: null });
    documentsRepository.recordDownload.mockResolvedValue({ data: null, error: { message: 'database unavailable' } });
    await expect(downloadDocument({ db: {}, supabase: makeSupabase(), config, id: row.id, userId: 'student' })).rejects.toThrow(/download tracking failed/);
  });
});
