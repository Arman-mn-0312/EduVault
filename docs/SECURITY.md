# Security notes (living document)

## Invariants
1. The service-role key exists only in server code paths: `server/src/services/supabaseService.js` (`adminClient()`), `server/scripts/create-admin.js`, plus config plumbing. It is never in `client/` or any `VITE_*` variable. Check: `grep -ri service_role client/` must return nothing.
2. Identity comes from a verified Supabase JWT (`auth.getUser`). Role and status come from `public.profiles`, never from JWT `user_metadata`/`app_metadata` (users can edit their own `user_metadata`).
3. The server never accepts user IDs, roles, status, approval state, or download counts from request bodies. Profile updates use a strict schema that rejects unknown keys with 400.
4. Suspended accounts get `403 ACCOUNT_SUSPENDED` on every authenticated route.
5. User data access uses a user-scoped client so Postgres RLS applies. The service role is reserved for storage, signed URLs, admin mutations, audit writes, and `record_download`.
6. Client route guards are UX only. Every API route re-checks on the server (`authenticate`, `requireRole`).

## Rate limiting
- Express: `auth` limiter counts failed authenticated requests (token guessing); general, upload, download, report, and search limiters exist and are attached as those routes are built.
- Sign-in, sign-up, and password reset go directly to Supabase Auth. Their limits are set in the Supabase dashboard (Authentication > Rate Limits). Review them.
- Express limits are in-memory per process.

## Verified controls and remaining gaps
- File validation, ZIP-bomb limits, and extraction guards are implemented in Phases 3 and 7.
- No malware scanning is integrated. None is claimed.
- Signed-URL issuance is not proof a download completed. Counts reflect authorized, successfully signed requests (Phase 5).
- Admin routes and audit writes are protected by backend role checks and append-only database policies (Phase 6).
- Live Supabase Auth, Storage, RLS, and migration verification require project credentials and were not possible in this environment.
- `mammoth` currently brings a moderate `sprintf-js` audit finding through a transitive dependency. The available automatic fix is a breaking downgrade, so it was not applied without a compatibility review.
