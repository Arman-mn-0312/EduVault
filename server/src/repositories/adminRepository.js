const USER_COLUMNS = 'id, full_name, email, role, status, created_at';
const DOCUMENT_COLUMNS = 'id, uploader_id, title, original_filename, file_extension, mime_type, file_size, subject, topic, tags, field_discipline, course_program, semester_study_year, document_type, academic_year, college_university, status, rejection_reason, download_count, created_at, updated_at, storage_path';
const REPORT_COLUMNS = 'id, document_id, reporter_id, reason, details, status, reviewed_by, reviewed_at, created_at';

function range(page, limit) {
  return { from: (page - 1) * limit, to: page * limit - 1 };
}

function escapePostgrestPattern(value) {
  return value.replace(/[\\,().*]/g, '\\$&');
}

function withCount(query, page, limit) {
  const { from, to } = range(page, limit);
  return query.range(from, to);
}

export function listUsers(db, { q, status, role, sort = 'newest', page, limit }) {
  let query = db.from('profiles').select(`${USER_COLUMNS}, documents(count)`, { count: 'exact' });
  if (q) {
    const pattern = escapePostgrestPattern(q);
    query = query.or(`full_name.ilike.%${pattern}%,email.ilike.%${pattern}%`);
  }
  if (status) query = query.eq('status', status);
  if (role) query = query.eq('role', role);
  query = query.order(sort === 'name' ? 'full_name' : 'created_at', { ascending: sort === 'name' });
  return withCount(query, page, limit);
}

export function getUser(db, id) {
  return db.from('profiles').select(USER_COLUMNS).eq('id', id).maybeSingle();
}

export function countActiveAdmins(db) {
  return db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('status', 'active');
}

export function updateUserStatus(db, id, status) {
  return db.from('profiles').update({ status }).eq('id', id).select(USER_COLUMNS).maybeSingle();
}

export function listDocuments(db, { q, status, fileType, fieldDiscipline, courseProgram, semesterStudyYear, documentType, academicYear, collegeUniversity, sort = 'newest', page, limit }) {
  let query = db.from('documents').select(`${DOCUMENT_COLUMNS}, uploader:profiles!documents_uploader_id_fkey(full_name,email)`, { count: 'exact' });
  if (q) {
    const pattern = escapePostgrestPattern(q);
    query = query.or(`title.ilike.%${pattern}%,original_filename.ilike.%${pattern}%,subject.ilike.%${pattern}%,field_discipline.ilike.%${pattern}%,course_program.ilike.%${pattern}%,college_university.ilike.%${pattern}%`);
  }
  if (status) query = query.eq('status', status);
  if (fileType) query = query.eq('file_extension', fileType);
  if (fieldDiscipline) query = query.eq('field_discipline', fieldDiscipline);
  if (courseProgram) query = query.eq('course_program', courseProgram);
  if (semesterStudyYear) query = query.eq('semester_study_year', semesterStudyYear);
  if (documentType) query = query.eq('document_type', documentType);
  if (academicYear) query = query.eq('academic_year', academicYear);
  if (collegeUniversity) query = query.eq('college_university', collegeUniversity);
  const sortColumn = sort === 'downloads' ? 'download_count' : sort === 'title' ? 'title' : 'created_at';
  return withCount(query.order(sortColumn, { ascending: sortColumn === 'title' }), page, limit);
}

export function getDocument(db, id) {
  return db.from('documents').select(DOCUMENT_COLUMNS).eq('id', id).maybeSingle();
}

export function updateDocumentModeration(db, id, payload) {
  return db.from('documents').update(payload).eq('id', id).select(DOCUMENT_COLUMNS).maybeSingle();
}

export function deleteDocument(db, id) {
  return db.from('documents').delete().eq('id', id);
}

export function listReports(db, { status, page, limit }) {
  let query = db.from('document_reports').select(
    `${REPORT_COLUMNS}, document:documents!document_reports_document_id_fkey(title, original_filename), reporter:profiles!document_reports_reporter_id_fkey(full_name,email)`,
    { count: 'exact' },
  );
  if (status) query = query.eq('status', status);
  return withCount(query.order('created_at', { ascending: false }), page, limit);
}

export function getReport(db, id) {
  return db.from('document_reports').select(REPORT_COLUMNS).eq('id', id).maybeSingle();
}

export function updateReport(db, id, reviewerId, status) {
  return db.from('document_reports').update({ status, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() }).eq('id', id).select(REPORT_COLUMNS).maybeSingle();
}

export function insertAudit(db, row) {
  return db.from('admin_audit_logs').insert(row).select('id, created_at').maybeSingle();
}

export function listAuditLogs(db, { q, page, limit }) {
  let query = db.from('admin_audit_logs').select('id, actor_id, action, target_type, target_id, details, created_at, actor:profiles!admin_audit_logs_actor_id_fkey(full_name,email)', { count: 'exact' });
  if (q) {
    const pattern = escapePostgrestPattern(q);
    query = query.or(`action.ilike.%${pattern}%,target_type.ilike.%${pattern}%,target_id.ilike.%${pattern}%`);
  }
  return withCount(query.order('created_at', { ascending: false }), page, limit);
}

export function dashboardCounts(db) {
  return Promise.all([
    db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
    db.from('documents').select('id', { count: 'exact', head: true }),
    db.from('documents').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    db.from('documents').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    db.from('documents').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
    db.from('document_downloads').select('id', { count: 'exact', head: true }),
  ]);
}

export function recentUploads(db) {
  return db.from('documents').select('id, title, original_filename, status, created_at, uploader:profiles!documents_uploader_id_fkey(full_name,email)').order('created_at', { ascending: false }).limit(8);
}

export function mostDownloaded(db) {
  return db.from('documents').select('id, title, original_filename, download_count, status').order('download_count', { ascending: false }).limit(8);
}

export function recentOpenReports(db) {
  return db.from('document_reports').select('id, document_id, reason, status, created_at, document:documents!document_reports_document_id_fkey(title), reporter:profiles!document_reports_reporter_id_fkey(full_name)').eq('status', 'open').order('created_at', { ascending: false }).limit(8);
}

export { escapePostgrestPattern };
