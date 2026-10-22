# Student Knowledge Hub — rules for Claude Code

Read docs/IMPLEMENTATION_PLAN.md before doing anything. It is the source of truth.

## Process
- Work ONE phase at a time. At the end of a phase: run builds + tests, write the phase report (template in the plan), `git commit`, then STOP and wait for "continue".
- Inspect existing files first; preserve useful work; never delete user data.
- Never claim something works unless you ran it. Mark skipped integrations as skipped.
- Never invent credentials or deployment results.

## Security invariants
- Service-role key: server only, never in client code or VITE_* variables.
- Never trust client-sent user IDs, roles, status, or download counts.
- Admin routes: server-side `requireRole('admin')`.
- Bucket stays private. No permanent public file URLs. Signed URLs are short-lived.
- Download count only through the `record_download` RPC, only after a signed URL was created.
- Prefer the user-JWT Supabase client (RLS). Use service role only for: storage writes/deletes, signed URLs, admin mutations, `record_download`, audit-log writes.

## Stack
React + Vite + JS + Tailwind + React Router + Lucide | Express | Supabase (Postgres, Auth, Storage) | Vitest (+ supertest on server)
