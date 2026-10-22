import { AppError } from '../utils/AppError.js';
import * as adminRepository from '../repositories/adminRepository.js';

function ensure(result, action) {
  if (result.error) throw new Error(`admin ${action} failed: ${result.error.message}`);
  return result;
}

function audit(supabase, actorId, action, targetType, targetId, details = {}) {
  return adminRepository.insertAudit(supabase.adminClient(), {
    actor_id: actorId, action, target_type: targetType, target_id: targetId, details,
  });
}

export function dtoUser(row) {
  return { id: row.id, fullName: row.full_name, email: row.email, role: row.role, status: row.status, createdAt: row.created_at, documentCount: row.documents?.[0]?.count || 0 };
}

export function dtoDocument(row) {
  return { id: row.id, title: row.title, documentName: row.title, originalFilename: row.original_filename, subject: row.subject, topic: row.topic, tags: row.tags || [], fieldDiscipline: row.field_discipline, courseProgram: row.course_program, semesterStudyYear: row.semester_study_year, documentType: row.document_type, academicYear: row.academic_year, collegeUniversity: row.college_university, uploaderName: row.uploader?.full_name || null, uploaderEmail: row.uploader?.email || null, createdAt: row.created_at, fileExtension: row.file_extension, mimeType: row.mime_type, fileSize: row.file_size, status: row.status, rejectionReason: row.rejection_reason, downloadCount: row.download_count };
}

export function dtoReport(row) {
  return { id: row.id, documentId: row.document_id, documentTitle: row.document?.title || null, originalFilename: row.document?.original_filename || null, reporterName: row.reporter?.full_name || null, reporterEmail: row.reporter?.email || null, reason: row.reason, details: row.details, status: row.status, createdAt: row.created_at, reviewedAt: row.reviewed_at };
}

export async function suspendOrReactivate({ db, supabase, actor, id, status }) {
  if (id === actor.id) throw AppError.badRequest('You cannot change your own account status.');
  const target = ensure(await adminRepository.getUser(db, id), 'user lookup');
  if (!target.data) throw AppError.notFound('User not found.');
  if (target.data.role === 'admin' && status === 'suspended') {
    const admins = ensure(await adminRepository.countActiveAdmins(db), 'administrator count');
    if ((admins.count || 0) <= 1) throw AppError.conflict('The last active administrator cannot be suspended.');
  }
  const result = ensure(await adminRepository.updateUserStatus(db, id, status), 'user status update');
  if (!result.data) throw AppError.notFound('User not found.');
  ensure(await audit(supabase, actor.id, status === 'suspended' ? 'user_suspended' : 'user_reactivated', 'profile', id), 'audit write');
  return dtoUser(result.data);
}

export async function moderateDocument({ db, supabase, actor, id, status, rejectionReason }) {
  const current = ensure(await adminRepository.getDocument(db, id), 'document lookup');
  if (!current.data) throw AppError.notFound('Document not found.');
  const result = ensure(await adminRepository.updateDocumentModeration(db, id, { status, rejection_reason: status === 'rejected' ? rejectionReason || null : null, reviewed_by: actor.id, reviewed_at: new Date().toISOString() }), 'document moderation');
  if (!result.data) throw AppError.notFound('Document not found.');
  ensure(await audit(supabase, actor.id, status === 'approved' ? 'document_approved' : 'document_rejected', 'document', id, { status }), 'audit write');
  return dtoDocument(result.data);
}

export async function removeDocument({ db, supabase, config, actor, id }) {
  const current = ensure(await adminRepository.getDocument(db, id), 'document lookup');
  if (!current.data) throw AppError.notFound('Document not found.');
  const storage = supabase.adminClient().storage.from(config.supabase.bucket);
  const removed = await storage.remove([current.data.storage_path]);
  if (removed.error) throw new Error(`admin document storage removal failed: ${removed.error.message}`);
  const result = ensure(await adminRepository.deleteDocument(db, id), 'document removal');
  ensure(await audit(supabase, actor.id, 'document_removed', 'document', id, { title: current.data.title }), 'audit write');
  return result;
}

export async function reviewReport({ db, supabase, actor, id, status }) {
  const current = ensure(await adminRepository.getReport(db, id), 'report lookup');
  if (!current.data) throw AppError.notFound('Report not found.');
  const result = ensure(await adminRepository.updateReport(db, id, actor.id, status), 'report review');
  if (!result.data) throw AppError.notFound('Report not found.');
  ensure(await audit(supabase, actor.id, `report_${status}`, 'report', id, { documentId: current.data.document_id }), 'audit write');
  return dtoReport(result.data);
}

export { ensure };
