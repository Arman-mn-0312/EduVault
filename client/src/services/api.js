/**
 * Thin fetch wrapper for the Express API.
 * - Parses the server's error envelope { error: { code, message, details } }.
 * - Auth: Phase 2 registers a token provider via setTokenProvider() so every
 *   request carries the Supabase session JWT. The client never sends user IDs or roles.
 */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

let tokenProvider = async () => null;
export function setTokenProvider(fn) {
  tokenProvider = fn;
}

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function apiFetch(path, { method = 'GET', body, headers = {}, signal, auth = true } = {}) {
  const finalHeaders = { Accept: 'application/json', ...headers };
  if (auth) {
    const token = await tokenProvider();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }
  const isJson = body !== undefined && !(body instanceof FormData);
  if (isJson) finalHeaders['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : isJson ? JSON.stringify(body) : body,
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }

  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code || 'HTTP_ERROR', e?.message || `Request failed (${res.status})`, e?.details);
  }
  return data;
}

export const getHealth = (opts) => apiFetch('/health', { auth: false, ...opts });

export async function apiUpload(path, formData, { onProgress } = {}) {
  const token = await tokenProvider();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}${path}`);
    xhr.setRequestHeader('Accept', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.'));
    xhr.onload = () => {
      let data = null;
      try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { /* handled as HTTP error */ }
      if (xhr.status < 200 || xhr.status >= 300) {
        const e = data?.error;
        reject(new ApiError(xhr.status, e?.code || 'HTTP_ERROR', e?.message || `Request failed (${xhr.status})`, e?.details));
        return;
      }
      resolve(data);
    };
    xhr.send(formData);
  });
}

export const getMyUploads = () => apiFetch('/documents/mine');
export const getMetadataOptions = () => apiFetch('/documents/metadata-options');
export const updateDocument = (id, body) => apiFetch(`/documents/${id}`, { method: 'PATCH', body });
export const deleteDocument = (id) => apiFetch(`/documents/${id}`, { method: 'DELETE' });
export const getDocument = (id) => apiFetch(`/documents/${encodeURIComponent(id)}`);
export const downloadDocument = (id) => apiFetch(`/documents/${encodeURIComponent(id)}/download`, { method: 'POST' });
export const reportDocument = (id, body) => apiFetch(`/documents/${encodeURIComponent(id)}/reports`, { method: 'POST', body });
export const getAdminOverview = () => apiFetch('/admin/overview');
export const getAdminUsers = (params = {}) => apiFetch(`/admin/users?${new URLSearchParams(params)}`);
export const updateAdminUserStatus = (id, status) => apiFetch(`/admin/users/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { status } });
export const getAdminDocuments = (params = {}) => apiFetch(`/admin/documents?${new URLSearchParams(params)}`);
export const moderateAdminDocument = (id, body) => apiFetch(`/admin/documents/${encodeURIComponent(id)}/moderation`, { method: 'PATCH', body });
export const removeAdminDocument = (id) => apiFetch(`/admin/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const getAdminReports = (params = {}) => apiFetch(`/admin/reports?${new URLSearchParams(params)}`);
export const updateAdminReport = (id, status) => apiFetch(`/admin/reports/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status } });
export const getAdminAuditLogs = (params = {}) => apiFetch(`/admin/audit-logs?${new URLSearchParams(params)}`);
export const getAdminMetadataOptions = (params = {}) => apiFetch(`/admin/metadata-options?${new URLSearchParams(params)}`);
export const createAdminMetadataOption = (body) => apiFetch('/admin/metadata-options', { method: 'POST', body });
export const updateAdminMetadataOption = (id, body) => apiFetch(`/admin/metadata-options/${encodeURIComponent(id)}`, { method: 'PATCH', body });
export const deactivateAdminMetadataOption = (id) => apiFetch(`/admin/metadata-options/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const searchDocuments = (params, opts = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, value); });
  return apiFetch(`/search?${query.toString()}`, opts);
};
export const suggestDocuments = (q, opts = {}) => apiFetch(`/search/suggestions?q=${encodeURIComponent(q)}&limit=8`, opts);
