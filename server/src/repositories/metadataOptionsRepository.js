export function list(db, { fieldKey, q, includeInactive }) {
  let query = db.from('document_metadata_options')
    .select('id, field_key, option_value, option_label, sort_order, is_active, created_at, updated_at')
    ;
  if (fieldKey) query = query.eq('field_key', fieldKey);
  if (!includeInactive) query = query.eq('is_active', true);
  if (q) query = query.ilike('option_label', `%${q}%`);
  return query.order('sort_order', { ascending: true });
}

export function get(db, id) {
  return db.from('document_metadata_options')
    .select('id, field_key, option_value, option_label, sort_order, is_active, created_at, updated_at')
    .eq('id', id).maybeSingle();
}

export function findByValue(db, fieldKey, value) {
  return db.from('document_metadata_options')
    .select('id, field_key, option_value, option_label, sort_order, is_active')
    .eq('field_key', fieldKey).ilike('option_value', value).maybeSingle();
}

export function insert(db, row) {
  return db.from('document_metadata_options').insert(row)
    .select('id, field_key, option_value, option_label, sort_order, is_active, created_at, updated_at').maybeSingle();
}

export function update(db, id, payload) {
  return db.from('document_metadata_options').update(payload).eq('id', id)
    .select('id, field_key, option_value, option_label, sort_order, is_active, created_at, updated_at').maybeSingle();
}
