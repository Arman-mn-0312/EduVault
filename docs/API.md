# API (current)

Base path `/api`. Errors always use `{ "error": { "code", "message", "details?" } }`.
Authenticated routes need an `Authorization` header containing a bearer access token.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | none | Returns the health response described below. No secrets or credentials are exposed. |
| GET | `/profile` | any active user | Returns `{ profile: { id, fullName, email, role, status, createdAt } }` |
| PATCH | `/profile` | any active user | Body `{ "fullName": string(1..100) }`. Surrounding whitespace is trimmed before validation and persistence; whitespace-only names are rejected. Any other key returns 400. Identity comes from the token. |
| GET | `/documents/mine` | any active user | Returns the caller's uploads, including metadata and moderation status. |
| GET | `/documents/metadata-options` | any active user | Returns active admin-managed academic dropdown options. |
| POST | `/documents` | any active user | Multipart form with `file`, `title`, `subject`, optional `topic`, `subtopic`, `description`, and JSON `tags`. Files must be `.ppt`, `.pptx`, `.doc`, or `.docx`, with matching MIME type and signature. |
| PATCH | `/documents/:id` | document owner | Updates descriptive metadata only; ownership, file fields, and moderation fields cannot be changed. |
| DELETE | `/documents/:id` | document owner | Deletes the caller's document and its private Storage object. |
| GET | `/search` | any active user | Searches approved documents with server-side filters, sorting, and pagination. |
| GET | `/search/suggestions` | any active user | Returns up to 8 approved title suggestions for a query of at least 2 characters. |
| GET | `/documents/:id` | any active user | Returns one visible document's metadata without exposing its private Storage path. |
| POST | `/documents/:id/download` | any active user | Creates a short-lived signed URL for an approved document and records the atomic download. |
| POST | `/documents/:id/reports` | any active user | Submits a report for an approved visible document. |
| GET | `/admin/overview` | active admin | Returns live dashboard statistics and recent activity. |
| GET | `/admin/users` | active admin | Paginated user list with search and status filters. |
| PATCH | `/admin/users/:id/status` | active admin | Suspends/reactivates another account, subject to last-admin safeguards. |
| GET | `/admin/documents` | active admin | Paginated document moderation list. |
| PATCH | `/admin/documents/:id/moderation` | active admin | Approves or rejects a document. |
| DELETE | `/admin/documents/:id` | active admin | Removes the private Storage object and document metadata. |
| GET | `/admin/reports` | active admin | Paginated report list. |
| PATCH | `/admin/reports/:id` | active admin | Resolves, dismisses, or reopens a report. |
| GET | `/admin/audit-logs` | active admin | Paginated append-only audit log viewer. |
| GET | `/admin/metadata-options` | active admin | Lists active and inactive dropdown options. |
| POST | `/admin/metadata-options` | active admin | Adds an option to a fixed metadata field. |
| PATCH | `/admin/metadata-options/:id` | active admin | Edits a label/order or activates/deactivates an option. |
| DELETE | `/admin/metadata-options/:id` | active admin | Deactivates an option; it never deletes historical values. |

## Health response

`GET /api/health` returns:

```json
{
  "status": "ok",
  "env": "development",
  "uptimeSeconds": 123,
  "time": "2026-10-14T17:40:00.000Z",
  "supabase": {
    "configured": true,
    "serviceRoleConfigured": false
  },
  "uploads": {
    "maxFileSizeMb": 25,
    "moderationEnabled": true
  }
}
```

`status`, `env`, and `time` are strings. `uptimeSeconds` and `uploads.maxFileSizeMb`
are numbers. `supabase.configured`, `supabase.serviceRoleConfigured`, and
`uploads.moderationEnabled` are booleans. The response contains no Supabase keys,
URLs, tokens, or other credentials.

## Rate limiting

The general API limiter applies to `/api` and returns `429 RATE_LIMITED` after too
many requests. Authenticated routes also use the failed-auth limiter, which returns
`429 AUTH_RATE_LIMITED` after repeated failed authentication attempts. Successful
authenticated requests do not count toward `AUTH_RATE_LIMITED`.

## Standard errors

Error responses preserve the `{ "error": { "code", "message", "details?" } }`
envelope. The currently exposed error codes are:

- `400 INVALID_JSON` — malformed JSON request body.
- `400 BAD_REQUEST` — request validation failed; `details.fields` may identify invalid fields.
- `401 UNAUTHORIZED` — authentication is missing or invalid.
- `403 ACCOUNT_SUSPENDED` — the authenticated account is suspended.
- `403 FORBIDDEN` — the authenticated user lacks permission or has no profile.
- `404 NOT_FOUND` — the route or requested profile does not exist.
- `413 PAYLOAD_TOO_LARGE` — the request body exceeds the configured limit.
- `429 RATE_LIMITED` — the general API request limit was exceeded.
- `429 AUTH_RATE_LIMITED` — the failed-authentication request limit was exceeded.
- `429 UPLOAD_RATE_LIMITED` — the document upload limit was exceeded.
- `429 SEARCH_RATE_LIMITED` — the search or suggestion request limit was exceeded.
- `503 SERVICE_UNAVAILABLE` — a required service is not configured or available.
- `503 AUTH_UNAVAILABLE` — the authentication provider is unavailable.
- `500 INTERNAL_ERROR` — an unexpected server-side error.

Uploads are stored in the private `documents` Supabase Storage bucket. Original
filenames are retained as metadata; storage paths use the authenticated uploader
ID and a generated UUID. When moderation is enabled, new uploads remain
`pending` until reviewed. No malware scanner or content extraction is integrated
in Phase 3.

Search is backed by the `search_documents` and `suggest_documents` PostgreSQL
RPCs. Results are restricted to approved documents, ranked by exact title,
title-prefix, title/content relevance, metadata matches, and trigram similarity.
Search supports subject, topic, file type, upload-date, sort, and page filters.

Document, search, download, report, admin, and extraction functionality are implemented.

## Fixed academic metadata

Every document uses exactly these product metadata fields. Existing columns are
reused where possible: `document_name` maps to `title`, `unit_topic` maps to
`topic`, and `tags_keywords` maps to `tags`. The legacy `subtopic` and
`description` columns remain supported for backward compatibility.

1. `document_name` — text, required
2. `field_discipline` — admin-managed or custom text
3. `course_program` — admin-managed or custom text
4. `semester_study_year` — admin-managed or custom text
5. `subject` — text or admin-managed option, required
6. `unit_topic` — text
7. `document_type` — admin-managed or custom text
8. `academic_year` — `YYYY` or `YYYY/YYYY`
9. `college_university` — admin-managed or custom text
10. `tags_keywords` — up to ten tags

The option-management API cannot create or alter field definitions. It only
manages values for the fixed fields. Deactivation removes an option from new
uploads while preserving existing document values.
