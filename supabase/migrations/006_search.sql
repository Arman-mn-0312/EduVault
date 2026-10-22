-- 006: weighted document search and typo-tolerant suggestions
create extension if not exists pg_trgm;

alter table public.documents
  add column if not exists search_vector tsvector;

create or replace function public.documents_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', concat_ws(' ', new.subject, new.topic, new.subtopic, array_to_string(new.tags, ' '))), 'B') ||
    setweight(to_tsvector('english', concat_ws(' ', new.description, new.original_filename)), 'C') ||
    setweight(to_tsvector('english', left(coalesce(new.extracted_text, ''), 200000)), 'D');
  return new;
end
$$;

drop trigger if exists documents_search_vector_set on public.documents;
create trigger documents_search_vector_set
  before insert or update of title, subject, topic, subtopic, tags, description, original_filename, extracted_text
  on public.documents
  for each row execute function public.documents_search_vector();

update public.documents
set search_vector =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', concat_ws(' ', subject, topic, subtopic, array_to_string(tags, ' '))), 'B') ||
  setweight(to_tsvector('english', concat_ws(' ', description, original_filename)), 'C') ||
  setweight(to_tsvector('english', left(coalesce(extracted_text, ''), 200000)), 'D')
where search_vector is null;

create index if not exists documents_search_vector_gin_idx
  on public.documents using gin (search_vector);
create index if not exists documents_title_trgm_idx
  on public.documents using gin (title gin_trgm_ops);
create index if not exists documents_original_filename_trgm_idx
  on public.documents using gin (original_filename gin_trgm_ops);
create index if not exists documents_subject_trgm_idx
  on public.documents using gin (subject gin_trgm_ops);
create index if not exists documents_topic_trgm_idx
  on public.documents using gin (topic gin_trgm_ops);

create or replace function public.search_documents(
  p_query text,
  p_subject text default null,
  p_topic text default null,
  p_file_ext text default null,
  p_from date default null,
  p_to date default null,
  p_sort text default 'relevance',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  subject text,
  topic text,
  subtopic text,
  description text,
  original_filename text,
  file_extension text,
  mime_type text,
  file_size bigint,
  tags text[],
  status text,
  download_count integer,
  created_at timestamptz,
  uploader_name text,
  score double precision,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      lower(btrim(coalesce(p_query, ''))) as q,
      nullif(lower(btrim(p_subject)), '') as subject_filter,
      nullif(lower(btrim(p_topic)), '') as topic_filter,
      nullif(lower(btrim(p_file_ext)), '') as ext_filter,
      p_from as from_date,
      p_to as to_date,
      case when p_sort in ('relevance', 'newest', 'downloads') then p_sort else 'relevance' end as sort_mode,
      greatest(1, least(coalesce(p_limit, 20), 50)) as result_limit,
      greatest(0, coalesce(p_offset, 0)) as result_offset
  ),
  candidates as (
    select
      d.*,
      au.full_name as uploader_name,
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
            similarity(d.title, params.q),
            similarity(coalesce(d.subject, ''), params.q)
          ) * 100
        else 0
      end::double precision as score
    from public.documents d
    join public.approved_uploaders au on au.id = d.uploader_id
    cross join params
    where d.status = 'approved'
      and (
        params.q = ''
        or lower(d.title) like '%' || params.q || '%'
        or lower(d.subject) like '%' || params.q || '%'
        or lower(coalesce(d.topic, '')) like '%' || params.q || '%'
        or lower(coalesce(d.subtopic, '')) like '%' || params.q || '%'
        or lower(coalesce(d.description, '')) like '%' || params.q || '%'
        or lower(d.original_filename) like '%' || params.q || '%'
        or exists (select 1 from unnest(d.tags) tag where lower(tag) like '%' || params.q || '%')
        or d.search_vector @@ websearch_to_tsquery('english', params.q)
        or similarity(d.title, params.q) > 0.3
        or similarity(coalesce(d.subject, ''), params.q) > 0.3
      )
      and (params.subject_filter is null or lower(d.subject) = params.subject_filter)
      and (params.topic_filter is null or lower(coalesce(d.topic, '')) = params.topic_filter)
      and (params.ext_filter is null or d.file_extension = params.ext_filter)
      and (params.from_date is null or d.created_at::date >= params.from_date)
      and (params.to_date is null or d.created_at::date <= params.to_date)
  ),
  counted as (
    select candidates.*, count(*) over () as total_count
    from candidates
  )
  select
    id, title, subject, topic, subtopic, description, original_filename,
    file_extension, mime_type, file_size, tags, status, download_count,
    created_at, uploader_name, score, total_count
  from counted, params
  order by
    case when params.sort_mode = 'relevance' then score end desc nulls last,
    case when params.sort_mode = 'newest' then created_at end desc nulls last,
    case when params.sort_mode = 'downloads' then download_count end desc nulls last,
    created_at desc
  limit (select result_limit from params)
  offset (select result_offset from params);
$$;

create or replace function public.suggest_documents(
  p_query text,
  p_limit integer default 8
)
returns table (
  id uuid,
  title text,
  subject text,
  file_extension text,
  uploader_name text,
  score double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select lower(btrim(coalesce(p_query, ''))) as q,
           greatest(1, least(coalesce(p_limit, 8), 8)) as result_limit
  )
  select d.id, d.title, d.subject, d.file_extension, au.full_name as uploader_name,
    case
      when lower(d.title) like (select q from params) || '%' then 100
      else similarity(d.title, (select q from params)) * 100
    end::double precision as score
  from public.documents d
  join public.approved_uploaders au on au.id = d.uploader_id
  where d.status = 'approved'
    and (select length(q) from params) >= 2
    and (
      lower(d.title) like (select q from params) || '%'
      or similarity(d.title, (select q from params)) > 0.25
    )
  order by
    (lower(d.title) like (select q from params) || '%') desc,
    similarity(d.title, (select q from params)) desc,
    d.created_at desc
  limit (select result_limit from params);
$$;

revoke all on function public.search_documents(text, text, text, text, date, date, text, integer, integer) from public, anon;
revoke all on function public.suggest_documents(text, integer) from public, anon;
grant execute on function public.search_documents(text, text, text, text, date, date, text, integer, integer) to authenticated, service_role;
grant execute on function public.suggest_documents(text, integer) to authenticated, service_role;
