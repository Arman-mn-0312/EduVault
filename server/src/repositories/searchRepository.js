export function search(db, params) {
  return db.rpc('search_documents_v2', params);
}

export function suggest(db, params) {
  return db.rpc('suggest_documents', params);
}
