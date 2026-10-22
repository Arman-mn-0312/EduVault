-- 005: private storage bucket
-- Only runs where the Supabase storage schema exists (skipped on plain Postgres).
-- No policies are created on storage.objects: with RLS on and no policy, API roles get
-- nothing. All reads/writes go through the Express API using the service role.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'documents', 'documents', false, 26214400,
      array[
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ]
    )
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
