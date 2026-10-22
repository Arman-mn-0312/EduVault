import { createHash, randomUUID } from 'node:crypto';
import * as documentsRepository from '../repositories/documentsRepository.js';
import { allowedDocuments, sanitizeOriginalFilename, validateDocumentFile } from '../validators/documents.js';
import { AppError } from '../utils/AppError.js';
import { extractDocumentText } from './documentExtraction.js';

function toDocumentDto(row, uploaderName = row.uploader_name) {
  return {
    id: row.id,
    title: row.title,
    originalFilename: row.original_filename,
    fileExtension: row.file_extension,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    subject: row.subject,
    topic: row.topic,
    subtopic: row.subtopic,
    description: row.description,
    tags: row.tags || [],
    documentName: row.title,
    fieldDiscipline: row.field_discipline,
    courseProgram: row.course_program,
    semesterStudyYear: row.semester_study_year,
    unitTopic: row.topic,
    documentType: row.document_type,
    academicYear: row.academic_year,
    collegeUniversity: row.college_university,
    tagsKeywords: row.tags || [],
    status: row.status,
    rejectionReason: row.rejection_reason,
    uploaderName: uploaderName || null,
    downloadCount: row.download_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getDocumentDetails({ db, id, profile }) {
  const result = await documentsRepository.getAccessible(db, id);
  if (result.error) throw new Error(`document lookup failed: ${result.error.message}`);
  if (!result.data) throw AppError.notFound('Document not found.');

  let uploaderName = result.data.uploader_id === profile.id ? profile.full_name : null;
  const uploader = await documentsRepository.getUploader(db, result.data.uploader_id);
  if (uploader.error) throw new Error(`document uploader lookup failed: ${uploader.error.message}`);
  uploaderName ||= uploader.data?.full_name || null;
  return toDocumentDto(result.data, uploaderName);
}

export async function downloadDocument({ db, supabase, config, id, userId }) {
  const result = await documentsRepository.getVisible(db, id);
  if (result.error) throw new Error(`document lookup failed: ${result.error.message}`);
  if (!result.data) throw AppError.notFound('Document not found.');

  const storage = storageFor(supabase, config.supabase.bucket);
  const filename = sanitizeOriginalFilename(result.data.original_filename) || `document.${result.data.file_extension}`;
  const signed = await storage.createSignedUrl(result.data.storage_path, config.signedUrlTtlSeconds, { download: filename });
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(`document signed URL generation failed: ${signed.error?.message || 'no URL returned'}`);
  }

  const recorded = await documentsRepository.recordDownload(supabase.adminClient(), id, userId);
  if (recorded.error) throw new Error(`document download tracking failed: ${recorded.error.message}`);
  return { url: signed.data.signedUrl, expiresIn: config.signedUrlTtlSeconds, downloadCount: recorded.data };
}

function storageFor(supabase, bucket) {
  if (!supabase.hasServiceRole) throw AppError.unavailable('Document storage is not configured on the server.');
  return supabase.adminClient().storage.from(bucket);
}

export async function uploadDocument({ req, supabase, config, metadata }) {
  const fileError = validateDocumentFile(req.file, config.upload.maxFileSizeBytes);
  if (fileError) throw AppError.badRequest('The document file is invalid.', { fields: [fileError] });

  const originalFilename = sanitizeOriginalFilename(req.file.originalname);
  const extension = originalFilename.toLowerCase().split('.').pop();
  const id = randomUUID();
  const storagePath = `${req.auth.profile.id}/${id}.${extension}`;
  const contentSha256 = createHash('sha256').update(req.file.buffer).digest('hex');
  const storage = storageFor(supabase, config.supabase.bucket);
  const uploadResult = await storage.upload(storagePath, req.file.buffer, {
    contentType: allowedDocuments[extension],
    upsert: false,
  });
  if (uploadResult.error) throw new Error(`document storage upload failed: ${uploadResult.error.message}`);

  let extraction;
  try {
    extraction = await extractDocumentText({
      buffer: req.file.buffer,
      extension,
      limits: config.extraction,
    });
  } catch (error) {
    extraction = { status: 'failed', text: null };
    console.warn(`[warn] document extraction failed for ${id}: ${error.message}`);
  }

  const row = {
    id,
    uploader_id: req.auth.profile.id,
    title: metadata.title,
    original_filename: originalFilename,
    storage_path: storagePath,
    file_extension: extension,
    mime_type: req.file.mimetype,
    file_size: req.file.size,
    content_sha256: contentSha256,
    subject: metadata.subject,
    topic: metadata.topic || null,
    subtopic: metadata.subtopic || null,
    description: metadata.description || null,
    tags: metadata.tags || [],
    field_discipline: metadata.field_discipline || null,
    course_program: metadata.course_program || null,
    semester_study_year: metadata.semester_study_year || null,
    document_type: metadata.document_type || null,
    academic_year: metadata.academic_year || null,
    college_university: metadata.college_university || null,
    status: 'pending',
    extracted_text: extraction.text,
    extraction_status: extraction.status,
  };

  let inserted = false;
  try {
    const { data, error } = await documentsRepository.insert(req.auth.db, row);
    if (error || !data) throw new Error(error?.message || 'document metadata insert returned no row');
    inserted = true;
    if (!config.upload.moderationEnabled && data.status !== 'approved') {
      const admin = supabase.adminClient();
      const result = await admin.from('documents').update({ status: 'approved' }).eq('id', id).select().maybeSingle();
      if (result.error || !result.data) throw new Error(result.error?.message || 'document approval failed');
      return toDocumentDto(result.data);
    }
    return toDocumentDto(data);
  } catch (error) {
    if (inserted) {
      const rollbackRow = await documentsRepository.deleteOwn(req.auth.db, id, req.auth.profile.id);
      if (rollbackRow.error) console.error(`[error] document metadata rollback failed: ${rollbackRow.error.message}`);
    }
    const cleanup = await storage.remove([storagePath]);
    if (cleanup.error) console.error(`[error] document rollback failed: ${cleanup.error.message}`);
    throw error;
  }
}

export { toDocumentDto };
