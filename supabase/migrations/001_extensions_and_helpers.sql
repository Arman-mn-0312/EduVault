-- 001: extensions and shared helpers
create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- True when the statement runs as a Supabase API role (i.e. on behalf of an end user
-- through PostgREST). service_role, postgres and other trusted roles return false.
create or replace function public.is_api_user_role()
returns boolean language sql stable as $$
  select current_user in ('anon', 'authenticated')
$$;
