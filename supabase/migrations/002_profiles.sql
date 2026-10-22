-- 002: profiles, role protection, admin helper
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null check (char_length(btrim(full_name)) between 1 and 100),
  email       text not null,
  role        text not null default 'student' check (role in ('student', 'admin')),
  status      text not null default 'active'  check (status in ('active', 'suspended')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index profiles_email_lower_key on public.profiles (lower(email));
create index profiles_role_idx   on public.profiles (role);
create index profiles_status_idx on public.profiles (status);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Helpers used by RLS policies. SECURITY DEFINER so they can read profiles without
-- recursing into the profiles policies. search_path is pinned to avoid hijacking.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  )
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active'
  )
$$;

-- New auth user -> profile. Role is ALWAYS 'student'. user_metadata is editable by the
-- user themselves, so nothing privileged is ever read from it.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  v_name := left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 100);
  if v_name = '' then
    v_name := left(split_part(new.email, '@', 1), 100);
  end if;
  if v_name = '' then
    v_name := 'Student';
  end if;
  insert into public.profiles (id, full_name, email, role, status)
  values (new.id, v_name, new.email, 'student', 'active');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profile email in sync when the auth email changes.
create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- Role/status/email/id can only be changed by trusted roles (service_role, postgres).
create or replace function public.protect_profile_fields()
returns trigger language plpgsql as $$
begin
  if public.is_api_user_role() then
    if new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.email is distinct from old.email
       or new.created_at is distinct from old.created_at then
      raise exception 'protected profile fields cannot be modified' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_protect_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- RLS
alter table public.profiles enable row level security;

create policy profiles_select_own   on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_select_admin on public.profiles for select to authenticated
  using (public.is_admin());
create policy profiles_update_own   on public.profiles for update to authenticated
  using (id = auth.uid() and status = 'active')
  with check (id = auth.uid());
-- No insert/delete policies: profiles are created by the trigger only.

revoke all on public.profiles from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
