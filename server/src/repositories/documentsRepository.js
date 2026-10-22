const COLUMNS = 'id, uploader_id, title, original_filename, storage_path, file_extension, mime_type, file_size, content_sha256, subject, topic, subtopic, description, tags, field_discipline, course_program, semester_study_year, document_type, academic_year, college_university, status, rejection_reason, download_count, created_at, updated_at';

export function listMine(db, uploaderId) {
  return db.from('documents').select(COLUMNS).eq('uploader_id', uploaderId).order('created_at', { ascending: false });
}

export function getOwn(db, id, uploaderId) {
  return db.from('documents').select(COLUMNS).eq('id', id).eq('uploader_id', uploaderId).maybeSingle();
}

export function getVisible(db, id) {
  return db.from('documents').select(COLUMNS).eq('id', id).eq('status', 'approved').maybeSingle();
}

export function getAccessible(db, id) {
  return db.from('documents').select(COLUMNS).eq('id', id).maybeSingle();
}

export function getUploader(db, id) {
  return db.from('approved_uploaders').select('id, full_name').eq('id', id).maybeSingle();
}

export function recordDownload(db, documentId, userId) {
  return db.rpc('record_download', { p_document_id: documentId, p_user_id: userId });
}

export function createReport(db, payload) {
  return db.from('document_reports').insert(payload).select('id, created_at').maybeSingle();
}

export function insert(db, row) {
  return db.from('documents').insert(row).select(COLUMNS).maybeSingle();
}

export function updateOwn(db, id, uploaderId, payload) {
  return db.from('documents').update(payload).eq('id', id).eq('uploader_id', uploaderId).select(COLUMNS).maybeSingle();
}

export function deleteOwn(db, id, uploaderId) {
  return db.from('documents').delete().eq('id', id).eq('uploader_id', uploaderId);
}
