-- 007: fixed academic metadata and admin-managed option values

alter table public.documents
  add column if not exists field_discipline text,
  add column if not exists course_program text,
  add column if not exists semester_study_year text,
  add column if not exists document_type text,
  add column if not exists academic_year text,
  add column if not exists college_university text;

alter table public.documents
  drop constraint if exists documents_academic_metadata_lengths;
alter table public.documents
  add constraint documents_academic_metadata_lengths check (
    (field_discipline is null or char_length(btrim(field_discipline)) between 1 and 100)
    and (course_program is null or char_length(btrim(course_program)) between 1 and 150)
    and (semester_study_year is null or char_length(btrim(semester_study_year)) between 1 and 80)
    and (document_type is null or char_length(btrim(document_type)) between 1 and 60)
    and (academic_year is null or char_length(btrim(academic_year)) between 1 and 20)
    and (college_university is null or char_length(btrim(college_university)) between 1 and 200)
  );

create index if not exists documents_field_discipline_idx on public.documents (field_discipline);
create index if not exists documents_course_program_idx on public.documents (course_program);
create index if not exists documents_semester_study_year_idx on public.documents (semester_study_year);
create index if not exists documents_document_type_idx on public.documents (document_type);
create index if not exists documents_academic_year_idx on public.documents (academic_year);
create index if not exists documents_college_university_idx on public.documents (college_university);

create table if not exists public.document_metadata_options (
  id uuid primary key default gen_random_uuid(),
  field_key text not null check (field_key in (
    'field_discipline', 'course_program', 'semester_study_year',
    'subject', 'document_type', 'academic_year', 'college_university'
  )),
  option_value text not null check (char_length(btrim(option_value)) between 1 and 200),
  option_label text not null check (char_length(btrim(option_label)) between 1 and 200),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (field_key, option_value)
);

create unique index if not exists document_metadata_options_normalized_idx
  on public.document_metadata_options (field_key, lower(btrim(option_value)));
create index if not exists document_metadata_options_lookup_idx
  on public.document_metadata_options (field_key, is_active, sort_order, option_label);

drop trigger if exists document_metadata_options_set_updated_at on public.document_metadata_options;
create trigger document_metadata_options_set_updated_at
  before update on public.document_metadata_options
  for each row execute function public.set_updated_at();

alter table public.document_metadata_options enable row level security;
revoke all on public.document_metadata_options from anon, authenticated;
grant select on public.document_metadata_options to authenticated;
grant all on public.document_metadata_options to service_role;

drop policy if exists metadata_options_read_active on public.document_metadata_options;
create policy metadata_options_read_active on public.document_metadata_options
  for select to authenticated
  using (public.is_active_user() and (is_active or public.is_admin()));

-- The API uses the service role only after requireRole('admin'). Direct client
-- writes are intentionally not granted, so field definitions cannot be changed.

create or replace function public.documents_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', concat_ws(' ',
      new.subject, new.topic, new.subtopic, new.field_discipline,
      new.course_program, new.semester_study_year, new.document_type,
      new.academic_year, new.college_university,
      array_to_string(new.tags, ' ')
    )), 'B') ||
    setweight(to_tsvector('english', concat_ws(' ', new.description, new.original_filename)), 'C') ||
    setweight(to_tsvector('english', left(coalesce(new.extracted_text, ''), 200000)), 'D');
  return new;
end
$$;

drop trigger if exists documents_search_vector_set on public.documents;
create trigger documents_search_vector_set
  before insert or update of title, subject, topic, subtopic, tags, description,
  original_filename, extracted_text, field_discipline, course_program,
  semester_study_year, document_type, academic_year, college_university
  on public.documents
  for each row execute function public.documents_search_vector();

update public.documents
set search_vector =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', concat_ws(' ',
    subject, topic, subtopic, field_discipline, course_program,
    semester_study_year, document_type, academic_year, college_university,
    array_to_string(tags, ' ')
  )), 'B') ||
  setweight(to_tsvector('english', concat_ws(' ', description, original_filename)), 'C') ||
  setweight(to_tsvector('english', left(coalesce(extracted_text, ''), 200000)), 'D');

create or replace function public.search_documents_v2(
  p_query text,
  p_subject text default null,
  p_topic text default null,
  p_file_ext text default null,
  p_from date default null,
  p_to date default null,
  p_sort text default 'relevance',
  p_limit integer default 20,
  p_offset integer default 0,
  p_field_discipline text default null,
  p_course_program text default null,
  p_semester_study_year text default null,
  p_document_type text default null,
  p_academic_year text default null,
  p_college_university text default null,
  p_tags_keyword text default null
)
returns table (
  id uuid, title text, subject text, topic text, subtopic text, description text,
  original_filename text, file_extension text, mime_type text, file_size bigint,
  tags text[], field_discipline text, course_program text, semester_study_year text,
  document_type text, academic_year text, college_university text, status text,
  download_count integer, created_at timestamptz, uploader_name text,
  score double precision, total_count bigint
)
language sql stable security invoker set search_path = public
as $$
  with params as (
    select lower(btrim(coalesce(p_query, ''))) as q,
      nullif(lower(btrim(p_subject)), '') as subject_filter,
      nullif(lower(btrim(p_topic)), '') as topic_filter,
      nullif(lower(btrim(p_file_ext)), '') as ext_filter,
      nullif(lower(btrim(p_field_discipline)), '') as discipline_filter,
      nullif(lower(btrim(p_course_program)), '') as course_filter,
      nullif(lower(btrim(p_semester_study_year)), '') as semester_filter,
      nullif(lower(btrim(p_document_type)), '') as type_filter,
      nullif(lower(btrim(p_academic_year)), '') as year_filter,
      nullif(lower(btrim(p_college_university)), '') as college_filter,
      nullif(lower(btrim(p_tags_keyword)), '') as tags_filter,
      p_from as from_date, p_to as to_date,
      case when p_sort in ('relevance', 'newest', 'downloads') then p_sort else 'relevance' end as sort_mode,
      greatest(1, least(coalesce(p_limit, 20), 50)) as result_limit,
      greatest(0, coalesce(p_offset, 0)) as result_offset
  ),
  candidates as (
    select d.*, au.full_name as uploader_name,
      case
        when lower(d.title) = params.q then 1000
        when lower(d.title) like params.q || '%' then 800
        when lower(d.title) like '%' || params.q || '%' then 650
        when lower(d.subject) like '%' || params.q || '%'
          or lower(coalesce(d.topic, '')) like '%' || params.q || '%' then 450
        when d.search_vector @@ websearch_to_tsquery('english', params.q)
          then 200 + (ts_rank_cd(d.search_vector, websearch_to_tsquery('english', params.q)) * 100)
        when similarity(d.title, params.q) > 0.3
          or similarity(coalesce(d.subject, ''), params.q) > 0.3 then 100 + greatest(
            similarity(d.title, params.q), similarity(coalesce(d.subject, ''), params.q)
          ) * 100
        else 0
      end::double precision as score
    from public.documents d
    join public.approved_uploaders au on au.id = d.uploader_id
    cross join params
    where d.status = 'approved'
      and (params.q = ''
        or lower(d.title) like '%' || params.q || '%'
        or lower(d.subject) like '%' || params.q || '%'
        or lower(coalesce(d.topic, '')) like '%' || params.q || '%'
        or lower(coalesce(d.subtopic, '')) like '%' || params.q || '%'
        or lower(coalesce(d.description, '')) like '%' || params.q || '%'
        or lower(d.original_filename) like '%' || params.q || '%'
        or exists (select 1 from unnest(d.tags) tag where lower(tag) like '%' || params.q || '%')
        or d.search_vector @@ websearch_to_tsquery('english', params.q)
        or similarity(d.title, params.q) > 0.3
        or similarity(coalesce(d.subject, ''), params.q) > 0.3)
      and (params.subject_filter is null or lower(d.subject) = params.subject_filter)
      and (params.topic_filter is null or lower(coalesce(d.topic, '')) = params.topic_filter)
      and (params.ext_filter is null or d.file_extension = params.ext_filter)
      and (params.discipline_filter is null or lower(coalesce(d.field_discipline, '')) = params.discipline_filter)
      and (params.course_filter is null or lower(coalesce(d.course_program, '')) = params.course_filter)
      and (params.semester_filter is null or lower(coalesce(d.semester_study_year, '')) = params.semester_filter)
      and (params.type_filter is null or lower(coalesce(d.document_type, '')) = params.type_filter)
      and (params.year_filter is null or lower(coalesce(d.academic_year, '')) = params.year_filter)
      and (params.college_filter is null or lower(coalesce(d.college_university, '')) = params.college_filter)
      and (params.tags_filter is null or exists (
        select 1 from unnest(d.tags) tag where lower(tag) like '%' || params.tags_filter || '%'
      ))
      and (params.from_date is null or d.created_at::date >= params.from_date)
      and (params.to_date is null or d.created_at::date <= params.to_date)
  ),
  counted as (select candidates.*, count(*) over () as total_count from candidates)
  select id, title, subject, topic, subtopic, description, original_filename,
    file_extension, mime_type, file_size, tags, field_discipline, course_program,
    semester_study_year, document_type, academic_year, college_university, status,
    download_count, created_at, uploader_name, score, total_count
  from counted, params
  order by
    case when params.sort_mode = 'relevance' then score end desc nulls last,
    case when params.sort_mode = 'newest' then created_at end desc nulls last,
    case when params.sort_mode = 'downloads' then download_count end desc nulls last,
    created_at desc
  limit (select result_limit from params) offset (select result_offset from params);
$$;

revoke all on function public.search_documents_v2(text, text, text, text, date, date, text, integer, integer, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.search_documents_v2(text, text, text, text, date, date, text, integer, integer, text, text, text, text, text, text, text) to authenticated, service_role;
