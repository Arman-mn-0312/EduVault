import { AppError } from '../utils/AppError.js';
import { METADATA_OPTION_FIELDS } from '../validators/metadataOptions.js';
import * as repository from '../repositories/metadataOptionsRepository.js';
import * as adminRepository from '../repositories/adminRepository.js';

const DOCUMENT_OPTION_FIELDS = Object.freeze({
  field_discipline: 'field_discipline',
  course_program: 'course_program',
  semester_study_year: 'semester_study_year',
  subject: 'subject',
  document_type: 'document_type',
  academic_year: 'academic_year',
  college_university: 'college_university',
});

function dto(row) {
  return {
    id: row.id,
    fieldKey: row.field_key,
    value: row.option_value,
    label: row.option_label,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ensure(result, action) {
  if (result.error) throw new Error(`metadata option ${action} failed: ${result.error.message}`);
  return result;
}

export async function list({ db, fieldKey, q, includeInactive = false }) {
  return (ensure(await repository.list(db, { fieldKey, q, includeInactive }), 'listing').data || []).map(dto);
}

export async function create({ db, supabase, actor, fieldKey, value, label, sortOrder }) {
  const normalizedValue = value.trim().replace(/\s+/g, ' ');
  const normalizedLabel = label.trim().replace(/\s+/g, ' ');
  const existing = ensure(await repository.findByValue(db, fieldKey, normalizedValue), 'duplicate lookup');
  if (existing.data) throw AppError.conflict('An option with this value already exists.');
  const result = await repository.insert(db, {
    field_key: fieldKey, option_value: normalizedValue, option_label: normalizedLabel, sort_order: sortOrder,
  });
  if (result.error?.code === '23505') throw AppError.conflict('An option with this value already exists.');
  ensure(result, 'creation');
  if (!result.data) throw new Error('metadata option creation returned no row');
  ensure(await adminRepository.insertAudit(supabase.adminClient(), {
    actor_id: actor.id, action: 'metadata_option_created', target_type: 'metadata_option',
    target_id: result.data.id, details: { fieldKey },
  }), 'audit write');
  return dto(result.data);
}

export async function update({ db, supabase, actor, id, payload }) {
  const current = ensure(await repository.get(db, id), 'lookup');
  if (!current.data) throw AppError.notFound('Metadata option not found.');
  const result = ensure(await repository.update(db, id, {
    ...(payload.label === undefined ? {} : { option_label: payload.label.trim().replace(/\s+/g, ' ') }),
    ...(payload.sortOrder === undefined ? {} : { sort_order: payload.sortOrder }),
    ...(payload.isActive === undefined ? {} : { is_active: payload.isActive }),
  }), 'update');
  if (!result.data) throw AppError.notFound('Metadata option not found.');
  ensure(await adminRepository.insertAudit(supabase.adminClient(), {
    actor_id: actor.id, action: payload.isActive === false ? 'metadata_option_deactivated' : 'metadata_option_updated',
    target_type: 'metadata_option', target_id: id, details: { fieldKey: current.data.field_key },
  }), 'audit write');
  return dto(result.data);
}

export async function validateDocumentMetadata({ db, metadata, existing = null, allowInactiveExisting = false }) {
  const values = Object.entries(DOCUMENT_OPTION_FIELDS)
    .map(([fieldKey, column]) => ({ fieldKey, column, value: metadata[column] }))
    .filter(({ value }) => typeof value === 'string' && value.trim());
  for (const { fieldKey, column, value } of values) {
    const options = ensure(await repository.list(db, { fieldKey, q: '', includeInactive: true }), 'validation').data || [];
    if (!options.length) continue;
    const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase();
    const match = options.find((option) => option.option_value.trim().toLowerCase() === normalized);
    const currentValue = existing?.[column]?.trim?.().toLowerCase?.();
    if (!match || (!match.is_active && !(allowInactiveExisting && currentValue === normalized))) {
      throw AppError.badRequest(`Select an active ${fieldKey.replaceAll('_', ' ')} option.`);
    }
  }
}

export { dto, DOCUMENT_OPTION_FIELDS, METADATA_OPTION_FIELDS };
