-- 003: documents
create table public.documents (
  id                uuid primary key default gen_random_uuid(),
  uploader_id       uuid not null references public.profiles(id) on delete restrict,
  title             text not null check (char_length(btrim(title)) between 1 and 200),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  storage_path      text not null unique,
  file_extension    text not null check (file_extension in ('ppt', 'pptx', 'doc', 'docx')),
  mime_type         text not null,
  file_size         bigint not null check (file_size > 0),
  content_sha256    text,
  subject           text not null check (char_length(btrim(subject)) between 1 and 100),
  topic             text check (topic is null or char_length(topic) <= 100),
  subtopic          text check (subtopic is null or char_length(subtopic) <= 100),
  description       text check (description is null or char_length(description) <= 2000),
  tags              text[] not null default '{}' check (cardinality(tags) <= 10),
  extracted_text    text,
  extraction_status text not null default 'none'
                    check (extraction_status in ('none', 'pending', 'done', 'failed', 'unsupported')),
  status            text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected', 'removed')),
  rejection_reason  text,
  reviewed_by       uuid references public.profiles(id) on delete set null,
  reviewed_at       timestamptz,
  download_count    integer not null default 0 check (download_count >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Non-search indexes. Full-text and trigram search indexes arrive with the Phase 4 migration.
create index documents_status_created_idx   on public.documents (status, created_at desc);
create index documents_uploader_created_idx on public.documents (uploader_id, created_at desc);
create index documents_status_downloads_idx on public.documents (status, download_count desc);
create index documents_subject_idx          on public.documents (subject);
create index documents_tags_gin_idx         on public.documents using gin (tags);

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- Students may edit descriptive metadata only. Status and review fields are admin-only.
-- File fields, ownership and download_count are never editable through the API roles.
create or replace function public.protect_document_fields()
returns trigger language plpgsql as $$
begin
  if public.is_api_user_role() then
    if new.id is distinct from old.id
       or new.uploader_id is distinct from old.uploader_id
       or new.storage_path is distinct from old.storage_path
       or new.original_filename is distinct from old.original_filename
       or new.file_extension is distinct from old.file_extension
       or new.mime_type is distinct from old.mime_type
       or new.file_size is distinct from old.file_size
       or new.content_sha256 is distinct from old.content_sha256
       or new.extracted_text is distinct from old.extracted_text
       or new.extraction_status is distinct from old.extraction_status
       or new.download_count is distinct from old.download_count
       or new.created_at is distinct from old.created_at then
      raise exception 'protected document fields cannot be modified' using errcode = '42501';
    end if;
    if not public.is_admin() then
      if new.status is distinct from old.status
         or new.rejection_reason is distinct from old.rejection_reason
         or new.reviewed_by is distinct from old.reviewed_by
         or new.reviewed_at is distinct from old.reviewed_at then
        raise exception 'only administrators can change moderation fields' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger documents_protect_fields
  before update on public.documents
  for each row execute function public.protect_document_fields();

alter table public.documents enable row level security;

create policy documents_select on public.documents for select to authenticated
  using (
    public.is_active_user()
    and (status = 'approved' or uploader_id = auth.uid() or public.is_admin())
  );

-- Inserts must be pending, owned by the caller, with a zero counter. Moderation-off
-- auto-approval is done server-side with the service role, never by the client.
create policy documents_insert_own on public.documents for insert to authenticated
  with check (
    public.is_active_user()
    and uploader_id = auth.uid()
    and status = 'pending'
    and download_count = 0
    and reviewed_by is null
  );

create policy documents_update_owner on public.documents for update to authenticated
  using (public.is_active_user() and uploader_id = auth.uid())
  with check (uploader_id = auth.uid());
create policy documents_update_admin on public.documents for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy documents_delete_owner on public.documents for delete to authenticated
  using (public.is_active_user() and uploader_id = auth.uid());
create policy documents_delete_admin on public.documents for delete to authenticated
  using (public.is_admin());

revoke all on public.documents from anon, authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant all on public.documents to service_role;

-- Safe uploader names for approved documents. Runs with owner rights (bypasses profiles RLS)
-- but exposes only id + display name, and only for people with an approved document.
create view public.approved_uploaders as
  select distinct p.id, p.full_name
  from public.profiles p
  join public.documents d on d.uploader_id = p.id
  where d.status = 'approved' and p.status = 'active';

revoke all on public.approved_uploaders from anon, authenticated;
grant select on public.approved_uploaders to authenticated;
grant all on public.approved_uploaders to service_role;
