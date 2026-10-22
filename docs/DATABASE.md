# Database

Source of truth: `supabase/migrations/*.sql` (applied in numeric order). The
manual Supabase CLI workflow is documented in
[`SUPABASE_MIGRATIONS.md`](SUPABASE_MIGRATIONS.md). Planned search objects
arrived in Phase 4. Overview and rationale: `IMPLEMENTATION_PLAN.md` section 2.

| Migration | Contents |
|---|---|
| 001 | `pg_trgm`, `pgcrypto`, `set_updated_at()`, `is_api_user_role()` |
| 002 | `profiles`, `is_admin()`, `is_active_user()`, signup trigger, email sync, protected-field trigger, RLS |
| 003 | `documents`, indexes (non-search), protected-field trigger, RLS, `approved_uploaders` view |
| 004 | `document_downloads`, `record_download()`, `document_reports`, `admin_audit_logs` (append-only), RLS |
| 005 | private `documents` storage bucket (no client policies) |
| 006 | full-text/trigram search vector, indexes, `search_documents()`, `suggest_documents()` |
| 007 | academic metadata, option values, expanded search vector, `search_documents_v2()` |

## Security model in one place
- **Roles.** `profiles.role` is `student` or `admin`. The signup trigger always writes `student` and ignores user metadata. Role, status, email, and id can only be changed by trusted roles (`service_role`, `postgres`), enforced by a trigger, not only by policy.
- **Documents.** Students see approved documents plus their own. Inserts must be `pending`, owned by the caller, with `download_count = 0`. Students can edit title/subject/topic/subtopic/description/tags only. Only admins change status/review fields. No API role can change `download_count`, `storage_path`, `uploader_id`, or file fields.
- **Moderation off.** If `MODERATION_ENABLED=false`, the server approves new uploads with the service role after insert (Phase 3). The client can never insert approved rows.
- **Downloads.** `record_download(doc, user)` is callable only by `service_role`. It increments and logs in one transaction and raises if the document is not approved.
- **Suspended users** are blocked at the database level too: they see no documents and cannot insert or edit.
- **Audit log.** Append-only for every role, including the table owner. The only allowed change is `actor_id` becoming NULL when an account is deleted. `actor_id` NULL also means a CLI/system action.
- **Uploader names.** Other students cannot read `profiles`. They read `approved_uploaders` (id + name only, only for people with an approved document).
- **Storage.** Bucket is private with no policies on `storage.objects`. Only the server (service role) reads or writes files.

## Tests
`supabase/tests/run_sql_tests.sh` creates a scratch database, applies a minimal `auth` stub, applies all migrations, and runs `rls_tests.sql` plus a concurrency check. Each assertion prints `ok` or aborts the run.

That harness requires a separate local PostgreSQL installation and does not
validate Supabase Storage. It is not part of the remote migration workflow.
