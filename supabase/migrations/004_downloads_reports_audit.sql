-- 004: downloads, reports, audit log

-- ---------- document_downloads ----------
create table public.document_downloads (
  id          bigint generated always as identity primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index document_downloads_doc_idx  on public.document_downloads (document_id, created_at desc);
create index document_downloads_user_idx on public.document_downloads (user_id, created_at desc);

alter table public.document_downloads enable row level security;
create policy downloads_select_own   on public.document_downloads for select to authenticated
  using (user_id = auth.uid());
create policy downloads_select_admin on public.document_downloads for select to authenticated
  using (public.is_admin());
-- No insert policy: rows are written only by record_download().

revoke all on public.document_downloads from anon, authenticated;
grant select on public.document_downloads to authenticated;
grant all on public.document_downloads to service_role;

-- Atomic count + log. Fails (and writes nothing) if the document is not approved.
create or replace function public.record_download(p_document_id uuid, p_user_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  update public.documents
     set download_count = download_count + 1
   where id = p_document_id and status = 'approved'
  returning download_count into v_count;

  if v_count is null then
    raise exception 'document is not downloadable' using errcode = 'P0002';
  end if;

  insert into public.document_downloads (document_id, user_id) values (p_document_id, p_user_id);
  return v_count;
end $$;

revoke all on function public.record_download(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_download(uuid, uuid) to service_role;

-- ---------- document_reports ----------
create table public.document_reports (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason      text not null check (reason in ('copyright', 'inappropriate', 'spam', 'wrong_content', 'other')),
  details     text check (details is null or char_length(details) <= 1000),
  status      text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index document_reports_one_open_per_user
  on public.document_reports (document_id, reporter_id) where status = 'open';
create index document_reports_status_idx on public.document_reports (status, created_at desc);

create or replace function public.protect_report_fields()
returns trigger language plpgsql as $$
begin
  if public.is_api_user_role() and (
       new.document_id is distinct from old.document_id
    or new.reporter_id is distinct from old.reporter_id
    or new.reason      is distinct from old.reason
    or new.details     is distinct from old.details
    or new.created_at  is distinct from old.created_at) then
    raise exception 'report content cannot be modified' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger document_reports_protect_fields
  before update on public.document_reports
  for each row execute function public.protect_report_fields();

alter table public.document_reports enable row level security;
-- The EXISTS subquery runs under the caller's RLS, so only visible documents can be reported.
create policy reports_insert_own on public.document_reports for insert to authenticated
  with check (
    public.is_active_user()
    and reporter_id = auth.uid()
    and status = 'open'
    and reviewed_by is null
    and exists (select 1 from public.documents d where d.id = document_id)
  );
create policy reports_select_own   on public.document_reports for select to authenticated
  using (reporter_id = auth.uid());
create policy reports_select_admin on public.document_reports for select to authenticated
  using (public.is_admin());
create policy reports_update_admin on public.document_reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.document_reports from anon, authenticated;
grant select, insert, update on public.document_reports to authenticated;
grant all on public.document_reports to service_role;

-- ---------- admin_audit_logs ----------
-- actor_id is NULL for system / CLI actions (e.g. first-admin bootstrap).
create table public.admin_audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null check (char_length(action) between 1 and 100),
  target_type text not null,
  target_id   text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index admin_audit_logs_created_idx on public.admin_audit_logs (created_at desc);
create index admin_audit_logs_actor_idx   on public.admin_audit_logs (actor_id, created_at desc);
create index admin_audit_logs_target_idx  on public.admin_audit_logs (target_type, target_id);

-- Append-only: blocks UPDATE/DELETE for every role (table owner and service_role included).
-- ON DELETE SET NULL from profiles is the one intended exception, so it is allowed by
-- permitting updates that change nothing except actor_id -> NULL.
create or replace function public.audit_logs_immutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and new.actor_id is null
     and (to_jsonb(new) - 'actor_id') = (to_jsonb(old) - 'actor_id') then
    return new;
  end if;
  raise exception 'admin_audit_logs is append-only' using errcode = '42501';
end $$;
create trigger admin_audit_logs_no_update before update on public.admin_audit_logs
  for each row execute function public.audit_logs_immutable();
create trigger admin_audit_logs_no_delete before delete on public.admin_audit_logs
  for each row execute function public.audit_logs_immutable();

alter table public.admin_audit_logs enable row level security;
create policy audit_select_admin on public.admin_audit_logs for select to authenticated
  using (public.is_admin());
-- No insert policy for API roles: the server writes audit rows with the service role.

revoke all on public.admin_audit_logs from anon, authenticated;
grant select on public.admin_audit_logs to authenticated;
grant select, insert on public.admin_audit_logs to service_role;
