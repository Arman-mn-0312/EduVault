# Student Knowledge Hub — Revised Implementation Plan

## 0. Working agreement (applies to every phase)

- Inspect the directory before editing. Preserve existing useful files.
- One phase at a time. Each phase ends with: build, tests, a written phase report, a git commit, then STOP and wait for "continue".
- Never claim an integration works unless it was actually executed. Integration tests that need Supabase credentials are marked `skipped (no credentials)` and reported as such.
- Never fabricate credentials, migration results, or deployments.
- Service-role key lives only on the server, only in files that are listed in SECURITY.md.

### Phase report template
1. Completed work  2. Files/migrations created  3. Commands run + real results
4. Skipped/unverified items and why  5. Blockers + exact manual setup needed  6. Next phase

---

## 1. Architecture

```
Browser (React/Vite on Vercel)
  |  Supabase Auth (anon key) -> session/JWT
  |  REST + Bearer JWT
  v
Express API (Render)
  |-- user-scoped Supabase client (JWT forwarded)  -> RLS enforced   [default for reads/owner writes]
  |-- service-role client (server only)            -> signed URLs, storage writes, admin ops, download RPC
  v
Supabase: Postgres (RLS, RPCs, triggers) + private Storage bucket "documents"
```

Layering inside `server/src`: routes -> controllers -> services -> repositories.
Validators (zod) sit in front of controllers. Middleware: auth, requireRole, rateLimiters, errorHandler.

### Key decisions
| Topic | Decision |
|---|---|
| Upload path | Browser -> Express (multipart, in-memory, 25 MB cap) -> validate -> service-role upload to private bucket -> insert row with user JWT (RLS). Direct browser-to-Storage upload is NOT used, because it would skip server-side signature checks. |
| Failure handling | Storage upload first, DB insert second. If insert fails, delete the storage object. If storage fails, no row is created. |
| Storage policies | No client-facing policies on `storage.objects` for the bucket (deny by default). Only the server touches it. |
| Downloads | Server checks auth, account status, document status, ownership/admin, then creates a 60 s signed URL, then calls `record_download` RPC. Failure to sign = no count. A signed URL being issued is not proof the file finished downloading (documented limitation). |
| Preview v1 | Metadata preview + secure download only. Embedded PPTX/DOCX preview deferred to Phase 9, only if a secure approach is verified (see §6). |
| Roles | `profiles.role` is protected by trigger + RLS. Public signup always creates `student`. |
| Search | One RPC `search_documents`, one RPC `suggest_documents`. All ranking lives in SQL. |
| Rate limiting | `express-rate-limit`: auth routes, upload route, download route, report route. |

### Directory layout
```
student-knowledge-hub/
  CLAUDE.md
  client/  (src/{components,layouts,pages,features,hooks,services,context,utils})
  server/  (src/{config,middleware,routes,controllers,services,repositories,validators,utils}, tests/)
  supabase/{migrations,seed.sql}
  docs/{IMPLEMENTATION_PLAN,API,DATABASE,SECURITY,DEPLOYMENT}.md
  server/scripts/create-admin.js
```

---

## 2. Database design (migrations land in Phase 2; search objects in Phase 4)

Extensions: `pg_trgm`, `pgcrypto`.

### profiles
`id uuid PK -> auth.users(id) ON DELETE CASCADE`, `full_name text NOT NULL`, `email text NOT NULL`,
`role text NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin'))`,
`status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended'))`,
`created_at`, `updated_at`.
- Trigger `handle_new_user` (SECURITY DEFINER) on `auth.users` insert: creates profile, role forced to `student`, ignores any metadata role.
- Trigger `protect_profile_fields` (BEFORE UPDATE): rejects changes to `role`, `status`, `email`, `id` unless the caller is `service_role`.
- Helper `is_admin()` SECURITY DEFINER, STABLE, used by policies.
- RLS: select own row; select all if `is_admin()`; update own row (only `full_name` effectively, enforced by trigger). No insert/delete policies for clients.

### documents
`id uuid PK DEFAULT gen_random_uuid()`, `uploader_id uuid NOT NULL -> profiles(id)`,
`title text NOT NULL (1..200)`, `original_filename text NOT NULL`, `storage_path text NOT NULL UNIQUE`,
`file_extension text CHECK IN ('ppt','pptx','doc','docx')`, `mime_type text`, `file_size bigint CHECK (>0)`,
`content_sha256 text`, `subject text NOT NULL`, `topic text`, `subtopic text`, `description text`,
`tags text[] DEFAULT '{}'`, `extracted_text text`, `extraction_status text DEFAULT 'none' CHECK IN ('none','pending','done','failed','unsupported')`,
`status text NOT NULL DEFAULT 'pending' CHECK IN ('pending','approved','rejected','removed')`,
`rejection_reason text`, `reviewed_by uuid`, `reviewed_at timestamptz`,
`download_count integer NOT NULL DEFAULT 0 CHECK (>=0)`, `search_vector tsvector`, `created_at`, `updated_at`.

Search vector (trigger-maintained, because `array_to_string` is not immutable and cannot be used in a generated column):
- A: title  - B: subject, topic, subtopic, tags  - C: description, original_filename  - D: left(extracted_text, 200000)

Indexes: GIN(`search_vector`); GIN trigram on `title`, `original_filename`, `subject`, `topic`; GIN(`tags`);
btree (`status`,`created_at` DESC), (`uploader_id`,`created_at` DESC), (`status`,`download_count` DESC), (`subject`).

RLS:
- select: `status='approved'` OR `uploader_id = auth.uid()` OR `is_admin()`
- insert: `uploader_id = auth.uid()` AND `status='pending'` (or `approved` only if moderation disabled, set by server config, never by client) AND `download_count = 0`
- update: owner or admin; trigger `protect_document_fields` blocks non-admin edits to `status, download_count, uploader_id, storage_path, reviewed_*`. Owner edits to an approved doc's metadata optionally return it to `pending` (configurable).
- delete: owner or admin (server also removes the storage object).

### document_downloads
`id bigint identity PK`, `document_id uuid -> documents ON DELETE CASCADE`, `user_id uuid -> profiles`, `created_at`.
Index (`document_id`,`created_at`), (`user_id`,`created_at`). RLS: select own / admin; inserts only through RPC.

### Atomic counting
```sql
create function record_download(p_document_id uuid, p_user_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare new_count integer;
begin
  update documents set download_count = download_count + 1
   where id = p_document_id and status = 'approved'
  returning download_count into new_count;
  if new_count is null then raise exception 'document not downloadable'; end if;
  insert into document_downloads(document_id, user_id) values (p_document_id, p_user_id);
  return new_count;
end $$;
revoke all on function record_download from public, anon, authenticated;
grant execute on function record_download to service_role;
```

### document_reports
`id uuid PK`, `document_id -> documents ON DELETE CASCADE`, `reporter_id -> profiles`,
`reason text CHECK IN ('copyright','inappropriate','spam','wrong_content','other')`, `details text`,
`status text DEFAULT 'open' CHECK IN ('open','resolved','dismissed')`, `reviewed_by`, `reviewed_at`, `created_at`.
Partial unique index on (`document_id`,`reporter_id`) WHERE `status='open'`. RLS: insert own; select own/admin; update admin.

### admin_audit_logs
`id bigint identity PK`, `actor_id -> profiles (NULL = CLI/system action)`, `action text`, `target_type text`, `target_id text`, `details jsonb DEFAULT '{}'`, `created_at`.
Append-only: select admin only, no update/delete policies, `REVOKE UPDATE, DELETE`. Never log secrets or file contents.

### Search RPCs (Phase 4)
`search_documents(p_query, p_subject, p_topic, p_file_ext, p_from, p_to, p_sort, p_limit, p_offset)`
returns rows + `score` + `total_count`. SECURITY INVOKER (RLS applies) and hard-filtered to `approved`.

Score tiers (higher wins, tie-break by `created_at`):
1. exact title (case-insensitive) = 100
2. title prefix = 80
3. all query words appear in title (ILIKE per word) = 60 + `ts_rank`
4. subject/topic match = 45
5. tags / description / filename / extracted text via `search_vector` (`websearch_to_tsquery` + prefix tsquery) = 20 + weighted `ts_rank_cd`
6. typo tolerance: `word_similarity(q, title) > 0.35` or `similarity(...) > 0.3` = 10 + similarity

`suggest_documents(p_query, p_limit default 8)`: title prefix first, then trigram, returns id, title, subject, file_extension, uploader display name.
Sort options: `relevance | newest | downloads`. Pagination: server-side `limit/offset` with `total_count`.

### Storage
Bucket `documents`: `public = false`, `file_size_limit` = 25 MB, allowed MIME list. Object key `{uploader_id}/{uuid}.{ext}`. No client policies.

---

## 3. Validation and abuse protection (Phase 3 / 7)

- Extension allow-list, MIME allow-list, filename sanitization (strip path separators, control chars, length cap). Stored name is a UUID, original name kept as metadata only.
- Signature check: PPTX/DOCX must start with `PK\x03\x04` and contain `[Content_Types].xml` plus `ppt/` or `word/` entries. PPT/DOC must start with OLE2 magic `D0 CF 11 E0 A1 B1 1A E1`.
- Extension and signature must agree. Macro-enabled (`.pptm/.docm`) and anything else is rejected.
- Extraction guards (Phase 7): max compressed size, max entry count, max total uncompressed bytes, max per-entry bytes, compression-ratio ceiling, wall-clock timeout. Extraction never executes content, never blocks upload, failure sets `extraction_status='failed'`.
- No malware scanner is integrated. Docs must say so. Optional future: ClamAV sidecar.
- Rate limits: auth (strict), upload (per-user), download, report, search/suggest (loose).
- Helmet, tight CORS (`CLIENT_ORIGIN`), JSON body size cap, consistent error envelope `{ error: { code, message, details? } }`.

---

## 4. Phases

### Phase 1 — Foundation  (this commit)
Scope: repo init, client + server scaffolding, env validation, error envelope, health route, security middleware, rate limiter factories, test harness, docs skeleton, CLAUDE.md.
Exit gate: `server` tests pass, `client` tests pass, `client` build succeeds, server boots without credentials and `/api/health` reports `supabase.configured=false`.

### Phase 2 — Supabase schema + auth
Migrations: extensions, profiles, triggers, `is_admin`, documents, downloads, reports, audit logs, RLS, bucket, `record_download`.
Server: Supabase clients (anon/user-scoped/service), `authenticate` + `requireRole` + suspended-account check, profile routes, `scripts/create-admin.js`.
Client: AuthContext, Register, Login, Reset password, ProtectedRoute/AdminRoute, Profile, AccessDenied.
Exit gate: unit tests with mocked Supabase for auth/role/escalation; SQL migrations linted by running on a local Postgres if available, otherwise flagged as unexecuted.

### Phase 3 — Uploads + My Uploads
Multer, validators, signature checks, upload service with rollback, owner edit/delete, My Uploads page, upload UI with real progress (XHR).
Exit gate: validation tests for extensions, MIME, signatures, size, spoofed files, ownership, rollback on storage/DB failure.

### Phase 4 — Search
Migration with tsvector trigger, indexes, `search_documents`, `suggest_documents`. API + debounced client search bar, filters, sort, pagination, results page, empty states.
Exit gate: SQL tests against a real Postgres if obtainable here, otherwise clearly reported as unexecuted. Required cases: "Data Integration Using Pandas", "Data Integration", "Pandas", "Integration", "Data", "Pandass" (typo).

### Phase 5 — Details + downloads
Details page, metadata preview, signed-URL download endpoint, `record_download`, report button + endpoint.
Exit gate: permission matrix tests (anon, owner, other student, admin, suspended, pending/rejected doc), no count on failed signing.

### Phase 6 — Admin
Stats, users (search, pagination, suspend/reactivate), documents (approve/reject/remove), reports (resolve/dismiss), audit logs. Every admin route behind `requireRole('admin')`, every mutation writes an audit row.
Exit gate: non-admin 403 on every admin route, audit-log assertions.

### Phase 7 — Extraction + hardening + responsive polish
PPTX/DOCX extraction service with ZIP guards, async after upload, loading/empty/error states, accessibility pass.

### Phase 8 — Verification + docs
Full test/build run, security review against SECURITY.md checklist, complete API/DATABASE/SECURITY/DEPLOYMENT docs, final report.

### Phase 9 — Optional embedded preview (only on explicit go-ahead)
See §6.

---

## 5. Deployment notes (full text in DEPLOYMENT.md, Phase 8)

- **Render free tier** spins down after about 15 minutes idle; the first request can take tens of seconds (cold start). Mitigations: client shows a "waking the server" state with retry, optionally an external uptime pinger (note: pinging has its own tradeoffs), or a paid instance.
- Memory is limited (free tier is small), so uploads are capped at 25 MB, processed in memory one file at a time, and extraction has hard limits. Raising the cap requires streaming to disk or a larger instance.
- No LibreOffice on free tier, so no server-side PPTX/DOCX -> PDF conversion.
- Verify current Render and Vercel limits on their pricing pages at deploy time; they change.
- Env vars per host listed in DEPLOYMENT.md. `SUPABASE_SECRET_KEY` only on Render.

## 6. Embedded preview options (Phase 9, deferred)

| Option | Works with private files? | Cost/risk |
|---|---|---|
| Office Online / Google viewer with signed URL | Needs a URL the third party can fetch; signed URL leaves your control for its lifetime | Privacy tradeoff, short expiry reduces but does not remove it |
| Server-side conversion to PDF (LibreOffice) | Yes, file never leaves your infra | Needs a container host with LibreOffice, CPU/memory cost, conversion sandboxing |
| DOCX -> HTML in-process (mammoth) | Yes | DOCX only, lossy, sanitize output (DOMPurify) |
Legacy PPT/DOC: not previewable in v1.

## 7. First-admin provisioning (Phase 2)

`cd server && node scripts/create-admin.js --email you@college.edu` promotes an existing registered user (requires `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in the shell), writes an audit row, refuses if the user does not exist. Alternative documented SQL for the Supabase SQL editor. Public endpoints can never set `role`.
