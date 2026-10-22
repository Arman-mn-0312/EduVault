# Supabase migration workflow

The SQL files in [`supabase/migrations`](../supabase/migrations) are the database
source of truth. Apply them manually with the Supabase CLI only after reviewing
the target project and the CLI output.

## Preconditions

- Do not use the real EduVault project until the migration set has been reviewed
  and a backup/recovery plan is in place.
- Do not use `server/.env` for CLI credentials.
- Do not put a service-role key, database password, or other secret in a script,
  source file, `VITE_*` variable, or command committed to the repository.
- The CLI must be authenticated separately using its supported login/password
  prompts or other local credential mechanism.
- The project reference must be the intended Supabase project. A project URL,
  publishable key, or service-role key is not a project reference.
- Migration 005 expects Supabase Storage tables to exist. The Supabase project
  must have its Storage subsystem available before applying it. The local plain
  PostgreSQL harness does not validate this behavior.

## Local checks only

From the repository root, run:

```powershell
.\scripts\apply-supabase-migrations.ps1 -ProjectRef 00000000000000000000
```

This validates that exactly migrations `001` through `007` are present and
ordered. It does not invoke the CLI, connect to Supabase, or run SQL. Replace
the placeholder with the intended 20-character project reference when doing
the later review; the command remains non-applying without `-Apply`.

## Explicit preview and apply workflow

After the local check, authenticate the CLI through its supported interactive
flow. Then review this command before running it:

```powershell
.\scripts\apply-supabase-migrations.ps1 `
  -ProjectRef <EXACT_20_CHARACTER_PROJECT_REF> `
  -Apply `
  -ConfirmProjectRef <EXACT_20_CHARACTER_PROJECT_REF>
```

The wrapper performs these explicit steps:

1. Rechecks the local migration inventory and numeric order.
2. Reads the remote migration history with `supabase migration list`.
3. Runs `supabase db push --dry-run`.
4. Requires the project reference as both an argument and a matching
   confirmation value.
5. Prompts for the exact project reference a final time.
6. Runs `supabase db push` only after all confirmations succeed.

Do not add `--include-all`, `db reset`, or a direct SQL-editor execution to this
workflow. `db push` uses Supabase's migration-history table and applies only
migrations not already recorded as applied. It does not make an existing,
partially-created schema safe to rerun: if a migration is absent from history
but its objects already exist, stop and investigate rather than forcing it.

The current migrations contain non-idempotent `CREATE TABLE`, `CREATE POLICY`,
`CREATE TRIGGER`, and `CREATE INDEX` statements. Migration 007 also replaces
search objects and backfills search vectors. Do not blindly rerun any migration
whose history/object state is unclear.

## Required post-apply verification

The CLI output alone is not application verification. After a successful,
reviewed apply, verify separately:

- `public.profiles` and `public.documents` exist through the intended API.
- Migrations `001` through `007` appear in Supabase migration history.
- The `documents` Storage bucket exists and is private.
- Auth signup creates a student profile.
- RLS, search RPCs, academic metadata, downloads, reports, and audit logging
  behave as expected.
- PostgREST schema cache has refreshed if the API temporarily reports stale
  schema errors.

Until those checks are completed, do not claim that the EduVault database is
initialized.

## Scope and safety boundary

The wrapper is a manually approved database operation. It is not imported by
the client, server, package scripts, deployment configuration, or application
startup. It does not install PostgreSQL or Docker and does not run the local
scratch PostgreSQL harness.
