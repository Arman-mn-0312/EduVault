#!/usr/bin/env bash
# Applies every migration to a throwaway database and runs RLS/trigger/RPC tests.
# Requires a reachable PostgreSQL (superuser) via the standard PG* env vars.
# Usage: PGHOST=localhost PGUSER=postgres ./run_sql_tests.sh
set -euo pipefail
cd "$(dirname "$0")"
DB="${TEST_DB:-skh_test}"
P=(psql -v ON_ERROR_STOP=1 -X -q)

"${P[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
"${P[@]}" -d "$DB" -f local_stub.sql
for f in ../migrations/*.sql; do echo "migration: $(basename "$f")"; "${P[@]}" -d "$DB" -f "$f"; done
"${P[@]}" -d "$DB" -f rls_tests.sql 2>&1

# Concurrency: 40 parallel downloads must yield exactly +40 and 40 log rows.
DOC=$("${P[@]}" -d "$DB" -tA -c "select id from public.documents where status='approved' limit 1")
BEFORE=$("${P[@]}" -d "$DB" -tA -c "select download_count from public.documents where id='$DOC'")
seq 1 40 | xargs -P 20 -I{} "${P[@]}" -d "$DB" -c "set role service_role; select public.record_download('$DOC','00000000-0000-0000-0000-00000000000b')" >/dev/null
AFTER=$("${P[@]}" -d "$DB" -tA -c "select download_count from public.documents where id='$DOC'")
ROWS=$("${P[@]}" -d "$DB" -tA -c "select count(*) from public.document_downloads where document_id='$DOC'")
echo "concurrency: before=$BEFORE after=$AFTER log_rows=$ROWS"
[ "$AFTER" -eq $((BEFORE + 40)) ] && [ "$ROWS" -eq "$AFTER" ] || { echo "FAIL: concurrent counter mismatch"; exit 1; }
echo "ok   - 40 concurrent downloads counted exactly"
"${P[@]}" -d postgres -c "drop database $DB"
