# EduVault

A web app where college students upload PowerPoint and Word study material, search what others have shared, and download the original files.

**Status: Phase 8 verification and deployment preparation complete.** See `docs/IMPLEMENTATION_PLAN.md` for the full phased plan, architecture, and database design.

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation: scaffolding, config, error handling, security middleware, tests | Done |
| 2 | Supabase schema, RLS, auth, roles, admin provisioning | Done (see "Verified vs. not yet verified") |
| 3 | Uploads, validation, My Uploads | Done |
| 4 | Search (pg_trgm + tsvector), suggestions, filters | Done |
| 5 | Details, secure downloads, reports | Done |
| 6 | Admin dashboard, moderation, audit logs | Done |
| 7 | Text extraction, hardening, responsive polish | Done |
| 8 | Full verification, security review, deployment docs | Complete locally; live verification pending credentials |

## What exists today
- Express API: env validation, Helmet, CORS allow-list, error envelope, rate limiters, `GET /api/health`, `GET/PATCH /api/profile`, `authenticate` + `requireRole` middleware.
- Database: 7 SQL migrations (profiles, documents, downloads, reports, audit log, search, academic metadata options, RLS, protected-field triggers, atomic `record_download`, private bucket).
- React app: register, log in, log out, forgot/reset password, profile editing, uploads, My Uploads, search, protected and admin route guards, toasts, live server status.
- First-admin provisioning script.
- DOCX/PPTX text extraction with bounded archive processing and search indexing.
- Admin dashboard, moderation, reports, audit logs, secure downloads, and deployment configuration.

## Requirements
Node.js 20 or newer.

## Setup
```bash
npm run install:all
cp server/.env.example server/.env     # Supabase values stay empty until Phase 2 setup
cp client/.env.example client/.env
npm run dev:server    # http://localhost:4000
npm run dev:client    # http://localhost:5173 (proxies /api to the server)
```

## Tests and build
```bash
npm test          # server (vitest + supertest) then client (vitest + Testing Library)
npm run build     # client production build
```

## Supabase setup (manual, required to run the app against a real backend)
1. Create a Supabase project.
2. **Keys.** Settings > API: put Project URL + publishable key in `client/.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) and URL + publishable key + secret key in `server/.env` (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`). The secret key goes in `server/.env` ONLY, never in `client/` or any `VITE_*` variable.
3. **Migrations.** Review [`docs/SUPABASE_MIGRATIONS.md`](docs/SUPABASE_MIGRATIONS.md)
   and use its explicitly confirmed Supabase CLI workflow. Do not paste these
   migrations into the remote SQL editor or run them during application startup.
4. **Auth settings** (dashboard > Authentication):
   - URL Configuration: set Site URL to your client origin and add `<client origin>/login` and `<client origin>/reset-password` to Redirect URLs.
   - Providers > Email: keep "Confirm email" on unless you have a reason to turn it off. Set a minimum password length of at least 8.
   - Rate Limits: review them. Sign-in, sign-up, and reset requests go directly to Supabase Auth, so this is where their throttling lives (the Express limiter cannot see them).
5. **First admin.** Register through the app, confirm the email, then:
   ```bash
   cd server && node scripts/create-admin.js --email you@college.edu
   ```
   This promotes an existing student, refuses unknown/suspended accounts, and writes an audit row. There is no public way to become an admin.
6. Confirm the bucket: Storage should show a **private** bucket named `documents` (created by migration 005).

## Verification status
Verified locally:
- Server: 74 tests passed.
- Client: 28 tests passed.
- Client production build passed.
- `GET /api/health` returned HTTP 200 with Supabase correctly reporting as unconfigured in this environment.
- The unauthenticated landing page loaded successfully in a browser against the Vite development server.
- Diagnostics reported no errors in the files changed for Phase 8.

Not verified (needs a Supabase project and PostgreSQL tooling):
- Real Supabase Auth: sign-up emails, confirmation, reset links, token verification via `auth.getUser`.
- Applying migrations and running the PostgreSQL/RLS/search integration suite; `psql` is unavailable here.
- Storage signed URLs, extraction persistence, download tracking, moderation, and audit behavior against live Supabase.
- Express rate limiting remains per process (in-memory); use a shared store before scaling out.

## Phase 5 download and preview behavior

Downloads require an authenticated request. The server checks the RLS-visible document and
approval status, creates a private Storage signed URL valid for the configured 10-600 second
TTL, and then calls the atomic `record_download` function. Storage paths, service-role
credentials,
and client-supplied counts or identities are never returned to the browser. A request that
fails before tracking is not counted. Because Storage signed URLs hand the file transfer to
the storage service, the counter records a successfully authorized URL issuance, not guaranteed
byte-for-byte completion or whether the user saved the file.

The details page provides metadata previews for all supported Office formats. It deliberately
does not embed private files or add a conversion service: server-side rendering would add
resource, privacy, and dependency costs, and previewing remains independent from downloads.

## Phase 6 administration

The `/admin` routes are protected in the browser for navigation only; every API endpoint also
verifies the Supabase token and the active database-backed `admin` role. Admin mutations are
performed through the service role only after that gate. User status changes cannot target the
current administrator or suspend the last active administrator. Document removal deletes the
private Storage object before deleting database metadata, and aborts if Storage cleanup fails.
Approvals, rejections, removals, user status changes, and report reviews create append-only
audit records without secrets. The dashboard and management tables use live paginated queries;
no statistics are hardcoded.

## Phase 7 text extraction

DOCX extraction uses `mammoth` raw-text extraction. PPTX extraction uses `jszip` with
`fast-xml-parser` to read slide and notes XML only; no macros, scripts, relationships, or
embedded content are executed. Legacy `.doc` and `.ppt` files remain uploadable and downloadable
but are marked `unsupported` and are not indexed.

ZIP processing is bounded by entry count, expanded byte count, compression ratio, extracted
character count, CRC validation, and a processing deadline. Extraction failures mark a document
`failed` without removing the original private Storage object or metadata. The existing
`documents_search_vector` trigger indexes successful `extracted_text` updates through the
existing search RPC. Extracted text is never returned in public document DTOs.

To re-run the SQL tests against any scratch Postgres: `PGHOST=localhost PGUSER=postgres supabase/tests/run_sql_tests.sh`.

## Phase 8 deployment and dependency notes

Render and Vercel configuration is provided in `render.yaml` and `client/vercel.json`.
See `docs/DEPLOYMENT.md` for secret configuration, redirect URLs, health checks, and
post-deployment verification. The server dependency audit reports three moderate
transitive findings through `mammoth` (`sprintf-js`); the available automated fix
requires a breaking downgrade, so it was not applied without a compatibility review.

## Docs
`docs/IMPLEMENTATION_PLAN.md` is complete. See `docs/API.md`, `docs/SECURITY.md`, and
`docs/DEPLOYMENT.md` for the current route, security, and deployment documentation.
