# Deployment

This repository is prepared for a Vercel frontend, Render backend, and Supabase
database/Auth/Storage deployment. No live deployment is claimed.

## Supabase

1. Create or select the project.
2. Review [`SUPABASE_MIGRATIONS.md`](SUPABASE_MIGRATIONS.md), authenticate the
   Supabase CLI separately, and use its explicitly confirmed wrapper command.
   Do not apply migrations automatically during application startup.
3. Confirm the `documents` Storage bucket is private.
4. Configure email confirmation, Site URL, and redirect URLs:
   - `https://<frontend-domain>/login`
   - `https://<frontend-domain>/reset-password`
5. Register a user, confirm the account, and run the existing admin provisioning script:
   `cd server && node scripts/create-admin.js --email admin@example.edu`

## Render backend

The root [`render.yaml`](../render.yaml) defines the Node web service. Set these
secret/environment values in the Render dashboard, never in the repository:

| Variable | Purpose |
|---|---|
| `CLIENT_ORIGIN` | Comma-separated Vercel origin allow-list |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Server token verification and user-scoped client key |
| `SUPABASE_SECRET_KEY` | Server-only privileged key |
| `SUPABASE_STORAGE_BUCKET` | Private bucket name, normally `documents` |
| `MODERATION_ENABLED` | Whether uploads remain pending |
| `SIGNED_URL_TTL_SECONDS` | Signed download URL lifetime |
| `MAX_FILE_SIZE_MB` | Upload limit |
| `EXTRACTION_MAX_*` | Archive and extraction safety limits |

The service health check is `GET /api/health`. Render free-tier instances may
sleep and produce cold-start latency; use a paid/non-sleeping plan if predictable
latency is required.

## Vercel frontend

Set the Vercel project root to `client`. The project uses [`client/vercel.json`](../client/vercel.json)
for React Router fallback behavior. Set:

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Full Render API URL ending in `/api` |
| `VITE_SUPABASE_URL` | Public Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public Supabase publishable key |

Never set `SUPABASE_SECRET_KEY` or any private backend secret in Vercel.

Build command: `npm run build`

## Deployment verification

After both services are deployed:

1. Open the Vercel URL and verify `GET /api/health` through the configured API URL.
2. Register and confirm a disposable account.
3. Verify login, password reset, upload, search, signed download, and logout.
4. Verify a non-admin receives `403` from `/api/admin/overview`.
5. Verify an admin can moderate a disposable document and see the audit entry.
6. Remove all disposable test data using the application’s authorized workflows.
