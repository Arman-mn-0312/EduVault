\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

-- ===== helpers =====
create schema t;
grant usage on schema t to public;

create function t.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;
create function t.as_service() returns void language plpgsql as $$
begin execute 'set local role service_role'; end $$;
create function t.as_postgres() returns void language plpgsql as $$
begin execute 'reset role'; end $$;

create function t.expect_error(p_sql text, p_state text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_state is null or sqlstate = p_state then
      raise notice 'ok   - %', p_label; return;
    end if;
    raise exception 'FAIL: % (expected %, got % : %)', p_label, p_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: % (no error was raised)', p_label;
end $$;

create function t.expect_affected(p_sql text, p_n int, p_label text) returns void language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  if n <> p_n then raise exception 'FAIL: % (expected % rows, got %)', p_label, p_n, n; end if;
  raise notice 'ok   - %', p_label;
end $$;

create function t.expect_count(p_sql text, p_n int, p_label text) returns void language plpgsql as $$
declare c int;
begin
  execute 'select count(*) from (' || p_sql || ') q' into c;
  if c <> p_n then raise exception 'FAIL: % (expected % rows, got %)', p_label, p_n, c; end if;
  raise notice 'ok   - %', p_label;
end $$;

-- ===== fixtures (as postgres) =====
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@uni.test', '{"full_name":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@uni.test',   '{"full_name":"Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@uni.test', '{"full_name":"Carol"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@uni.test',  '{"full_name":"Dave"}'),
  -- attacker tries to self-assign admin through signup metadata
  ('00000000-0000-0000-0000-00000000000e', 'eve@uni.test',   '{"full_name":"  Eve  ","role":"admin","status":"active"}'),
  ('00000000-0000-0000-0000-00000000000f', 'noname@uni.test', '{}');
update public.profiles set role = 'admin'     where email = 'carol@uni.test';
update public.profiles set status = 'suspended' where email = 'dave@uni.test';

-- ===== profiles =====
do $$ begin
  perform t.expect_count($q$select 1 from public.profiles where email='eve@uni.test' and role='student' and full_name='Eve'$q$, 1,
    'signup metadata cannot grant admin; name is trimmed');
  perform t.expect_count($q$select 1 from public.profiles where email='noname@uni.test' and full_name='noname'$q$, 1,
    'missing name falls back to email prefix');
end $$;

do $$ begin
  perform t.as_user('00000000-0000-0000-0000-00000000000a');
  perform t.expect_count('select 1 from public.profiles', 1, 'student sees only own profile');
  perform t.expect_affected($q$update public.profiles set full_name='Alice A' where id='00000000-0000-0000-0000-00000000000a'$q$, 1, 'student can edit own name');
  perform t.expect_error($q$update public.profiles set role='admin' where id='00000000-0000-0000-0000-00000000000a'$q$, '42501', 'student cannot promote self to admin');
end $$;

do $$ begin
  perform t.as_user('00000000-0000-0000-0000-00000000000a');
  perform t.expect_error($q$update public.profiles set email='x@y.z' where id='00000000-0000-0000-0000-00000000000a'$q$, '42501', 'student cannot change profile email');
  perform t.expect_error($q$update public.profiles set status='suspended' where id='00000000-0000-0000-0000-00000000000a'$q$, '42501', 'student cannot change own status');
  perform t.expect_affected($q$update public.profiles set full_name='Hacked' where id='00000000-0000-0000-0000-00000000000b'$q$, 0, 'student cannot edit another profile');
  perform t.expect_error($q$insert into public.profiles (id, full_name, email) values (gen_random_uuid(), 'x', 'x@x.x')$q$, '42501', 'students cannot insert profiles');
  perform t.expect_error($q$delete from public.profiles where id='00000000-0000-0000-0000-00000000000b'$q$, '42501', 'students cannot delete profiles');
end $$;

do $$ begin
  perform t.as_user('00000000-0000-0000-0000-00000000000c');
  perform t.expect_count('select 1 from public.profiles', 6, 'admin sees all profiles');
  perform t.as_postgres();
  perform t.as_service();
  perform t.expect_affected($q$update public.profiles set role='admin' where email='bob@uni.test'$q$, 1, 'service role can change role (admin provisioning path)');
  perform t.expect_affected($q$update public.profiles set role='student' where email='bob@uni.test'$q$, 1, 'service role can revert role');
end $$;

do $$ begin
  perform t.as_user('00000000-0000-0000-0000-00000000000d');
  perform t.expect_affected($q$update public.profiles set full_name='Dave2' where id='00000000-0000-0000-0000-00000000000d'$q$, 0, 'suspended user cannot edit profile');
  perform set_config('request.jwt.claim.sub', '', true);
  perform t.as_postgres();
  execute 'set local role anon';
  perform t.expect_error('select 1 from public.profiles', '42501', 'anon has no access to profiles');
end $$;

-- ===== documents =====
do $$ begin
  perform t.as_user('00000000-0000-0000-0000-00000000000a');
  perform t.expect_affected($q$insert into public.documents (uploader_id,title,original_filename,storage_path,file_extension,mime_type,file_size,subject)
    values ('00000000-0000-0000-0000-00000000000a','Data Integration Using Pandas','pandas.pptx','a/1.pptx','pptx','application/x','100','Data Science')$q$, 1,
    'student can insert own pending document');
  perform t.expect_error($q$insert into public.documents (uploader_id,title,original_filename,storage_path,file_extension,mime_type,file_size,subject,status)
    values ('00000000-0000-0000-0000-00000000000a','x','x.pptx','a/2.pptx','pptx','m','1','s','approved')$q$, '42501', 'student cannot insert as approved');
  perform t.expect_error($q$insert into public.documents (uploader_id,title,original_filename,storage_path,file_extension,mime_type,file_size,subject)
    values ('00000000-0000-0000-0000-00000000000b','x','x.pptx','a/3.pptx','pptx','m','1','s')$q$, '42501', 'student cannot upload as someone else');
  perform t.expect_error($q$insert into public.documents (uploader_id,title,original_filename,storage_path,file_extension,mime_type,file_size,subject,download_count)
    values ('00000000-0000-0000-0000-00000000000a','x','x.pptx','a/4.pptx','pptx','m','1','s',99)$q$, '42501', 'student cannot seed download_count');
  perform t.expect_error($q$insert into public.documents (uploader_id,title,original_filename,storage_path,file_extension,mime_type,file_size,subject)
    values ('00000000-0000-0000-0000-00000000000a','x','x.exe','a/5.exe','exe','m','1','s')$q$, '23514', 'extension check constraint rejects .exe');
  perform t.expect_count('select 1 from public.documents', 1, 'owner sees own pending document');
end $$;

do $$ begin
  perform t.as_user('00000000-0000-0000-0000-00000000000b');
  perform t.expect_count('select 1 from public.documents', 0, 'other student cannot see pending document');
end $$;

-- Pre-approval attacks by the owner
do $$ begin
  perform t.as_user('00000000-0000-0000-0000-00000000000a');
  perform t.expect_affected($q$update public.documents set title='Data Integration Using Pandas v2'$q$, 1, 'owner can edit title');
  perform t.expect_error($q$update public.documents set status='approved'$q$, '42501', 'owner cannot self-approve');
  perform t.expect_error($q$update public.documents set download_count=1000$q$, '42501', 'owner cannot change download_count');
  perform t.expect_error($q$update public.documents set storage_path='b/1.pptx'$q$, '42501', 'owner cannot repoint storage_path');
  perform t.expect_error($q$update public.documents set uploader_id='00000000-0000-0000-0000-00000000000b'$q$, '42501', 'owner cannot transfer ownership');
  perform t.expect_error($q$update public.documents set reviewed_by='00000000-0000-0000-0000-00000000000a'$q$, '42501', 'owner cannot forge review fields');
end $$;

-- Admin approves
do $$ begin
  perform t.as_user('00000000-0000-0000-0000-00000000000c');
  perform t.expect_count('select 1 from public.documents', 1, 'admin sees pending document');
  perform t.expect_affected($q$update public.documents set status='approved', reviewed_by='00000000-0000-0000-0000-00000000000c', reviewed_at=now()$q$, 1, 'admin can approve');
  perform t.expect_error($q$update public.documents set download_count=500$q$, '42501', 'even admins cannot edit download_count via API role');
end $$;

do $$ begin
  perform t.as_service();
  perform t.expect_affected($q$update public.documents set extracted_text='xylophone thermodynamics', extraction_status='done' where title='Data Integration Using Pandas v2'$q$, 1, 'trusted processor stores extracted text');
  perform t.as_user('00000000-0000-0000-0000-00000000000b');
  perform t.expect_count($q$select 1 from public.search_documents('xylophone', null, null, null, null, null, 'relevance', 20, 0)$q$, 1, 'search finds extracted text');
end $$;

-- ===== academic metadata migration 007 =====
do $$
declare
  v_target uuid := '00000000-0000-0000-0000-000000000071';
  v_other uuid := '00000000-0000-0000-0000-000000000072';
  v_pending uuid := '00000000-0000-0000-0000-000000000073';
  v_option uuid;
begin
  perform t.as_postgres();

  perform t.expect_count($q$
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'search_documents_v2'
      and pg_get_function_identity_arguments(p.oid) =
        'p_query text, p_subject text, p_topic text, p_file_ext text, p_from date, p_to date, p_sort text, p_limit integer, p_offset integer, p_field_discipline text, p_course_program text, p_semester_study_year text, p_document_type text, p_academic_year text, p_college_university text, p_tags_keyword text'
  $q$, 1, 'search_documents_v2 exists with expected signature');
  perform t.expect_count($q$
    select 1
    where has_function_privilege('authenticated',
      'public.search_documents_v2(text,text,text,text,date,date,text,integer,integer,text,text,text,text,text,text,text)',
      'execute')
      and has_function_privilege('service_role',
      'public.search_documents_v2(text,text,text,text,date,date,text,integer,integer,text,text,text,text,text,text,text)',
      'execute')
      and not has_function_privilege('anon',
      'public.search_documents_v2(text,text,text,text,date,date,text,integer,integer,text,text,text,text,text,text,text)',
      'execute')
  $q$, 1, 'search_documents_v2 grants are restricted');

  insert into public.documents (
    id, uploader_id, title, original_filename, storage_path, file_extension,
    mime_type, file_size, subject, field_discipline, course_program,
    semester_study_year, document_type, academic_year, college_university, tags
  ) values
    (v_target, '00000000-0000-0000-0000-00000000000a', 'Metadata filter target',
     'metadata-target.docx', 'a/metadata-target.docx', 'docx', 'm', 10, 'Algebra',
     'Science', 'BCA', 'Semester 3', 'Notes', '2025/2026', 'Edu University',
     array['linear-algebra', 'calculus']),
    (v_other, '00000000-0000-0000-0000-00000000000a', 'Metadata filter mismatch',
     'metadata-mismatch.docx', 'a/metadata-mismatch.docx', 'docx', 'm', 10, 'Algebra',
     'Science', 'MCA', 'Semester 3', 'Notes', '2025/2026', 'Edu University',
     array['linear-algebra']),
    (v_pending, '00000000-0000-0000-0000-00000000000a', 'Metadata pending',
     'metadata-pending.docx', 'a/metadata-pending.docx', 'docx', 'm', 10, 'Algebra',
     null, null, null, null, null, null, array[]::text[]);
  update public.documents set status = 'approved' where id in (v_target, v_other);

  insert into public.document_metadata_options (field_key, option_value, option_label, sort_order)
  values
    ('field_discipline', 'Science', 'Science', 1),
    ('course_program', 'BCA', 'BCA', 1)
  returning id into v_option;

  perform t.expect_count($q$
    select 1 from public.document_metadata_options
    where field_key = 'field_discipline' and option_value = 'Science' and is_active
  $q$, 1, 'active metadata option is seeded');
  update public.document_metadata_options
    set is_active = false
    where field_key = 'field_discipline' and option_value = 'Science';

  perform t.as_user('00000000-0000-0000-0000-00000000000b');
  perform t.expect_count($q$select 1 from public.document_metadata_options where field_key='course_program' and option_value='BCA'$q$, 1, 'student can read active options');
  perform t.expect_count($q$select 1 from public.document_metadata_options where field_key='field_discipline' and option_value='Science'$q$, 0, 'student cannot read inactive options');
  perform t.expect_count(format($q$select 1 from public.search_documents_v2('', null, null, null, null, null, 'relevance', 20, 0, 'Science', 'BCA', 'Semester 3', 'Notes', '2025/2026', 'Edu University', 'calculus')$q$), 1, 'combined academic filters use AND semantics');
  perform t.expect_count(format($q$select 1 from public.documents where id=%L$q$, v_target), 1, 'student can access approved metadata document');
  perform t.expect_count(format($q$select 1 from public.documents where id=%L$q$, v_pending), 0, 'student cannot access pending metadata document');
  perform t.expect_count(format($q$select 1 from public.documents where id=%L and field_discipline='Science'$q$, v_target), 1, 'deactivated option value remains on historical document');
  perform t.expect_count(format($q$select 1 from public.search_documents_v2('', null, null, null, null, null, 'relevance', 20, 0, 'Science', 'BCA', null, null, null, null, null)$q$), 1, 'historical deactivated option remains searchable');
  perform t.expect_count($q$
    select 1 from public.documents
    where title like 'Data Integration%' and field_discipline is null
  $q$, 1, 'existing approved document with NULL academic metadata remains accessible');

  perform t.expect_error($q$insert into public.document_metadata_options (field_key, option_value, option_label) values ('document_type','Notes','Notes')$q$, '42501', 'student cannot insert metadata option directly');
  perform t.expect_error($q$update public.document_metadata_options set option_label='Changed'$q$, '42501', 'student cannot update metadata option directly');
  perform t.expect_error($q$delete from public.document_metadata_options$q$, '42501', 'student cannot delete metadata option directly');

  perform t.as_user('00000000-0000-0000-0000-00000000000c');
  perform t.expect_count($q$select 1 from public.document_metadata_options where field_key='field_discipline' and option_value='Science'$q$, 1, 'admin can read inactive options');
  perform t.expect_error($q$update public.document_metadata_options set is_active=true where field_key='field_discipline' and option_value='Science'$q$, '42501', 'admin cannot bypass service-role option write path');
  perform t.expect_error($q$delete from public.document_metadata_options$q$, '42501', 'admin cannot directly delete metadata options');
  perform t.expect_error($q$insert into public.document_metadata_options (field_key, option_value, option_label) values ('unsupported_field','x','X')$q$, '42501', 'admin cannot write metadata options directly');

  perform t.as_service();
  perform t.expect_affected($q$update public.document_metadata_options set is_active=true where field_key='field_discipline' and option_value='Science'$q$, 1, 'service role reactivates metadata option for authorized API path');
  perform t.expect_affected($q$update public.document_metadata_options set is_active=false where field_key='field_discipline' and option_value='Science'$q$, 1, 'service role deactivates metadata option');
  perform t.expect_error($q$insert into public.document_metadata_options (field_key, option_value, option_label) values ('unsupported_field','x','X')$q$, '23514', 'unsupported metadata field key is rejected');
  perform t.expect_error($q$insert into public.document_metadata_options (field_key, option_value, option_label) values ('course_program',' bca ','Duplicate')$q$, '23505', 'normalized duplicate option is rejected');
  perform t.expect_affected(format($q$update public.documents set field_discipline='SearchDiscipline' where id=%L$q$, v_target), 1, 'discipline update refreshes search vector');
  perform t.expect_count(format($q$select 1 from public.documents where id=%L and search_vector @@ plainto_tsquery('english','SearchDiscipline')$q$, v_target), 1, 'discipline is searchable');
  perform t.expect_affected(format($q$update public.documents set course_program='SearchCourse' where id=%L$q$, v_target), 1, 'course update refreshes search vector');
  perform t.expect_count(format($q$select 1 from public.documents where id=%L and search_vector @@ plainto_tsquery('english','SearchCourse')$q$, v_target), 1, 'course is searchable');
  perform t.expect_affected(format($q$update public.documents set semester_study_year='SearchSemester' where id=%L$q$, v_target), 1, 'semester update refreshes search vector');
  perform t.expect_count(format($q$select 1 from public.documents where id=%L and search_vector @@ plainto_tsquery('english','SearchSemester')$q$, v_target), 1, 'semester is searchable');
  perform t.expect_affected(format($q$update public.documents set document_type='SearchType' where id=%L$q$, v_target), 1, 'document type update refreshes search vector');
  perform t.expect_count(format($q$select 1 from public.documents where id=%L and search_vector @@ plainto_tsquery('english','SearchType')$q$, v_target), 1, 'document type is searchable');
  perform t.expect_affected(format($q$update public.documents set academic_year='SearchYear' where id=%L$q$, v_target), 1, 'academic year update refreshes search vector');
  perform t.expect_count(format($q$select 1 from public.documents where id=%L and search_vector @@ plainto_tsquery('english','SearchYear')$q$, v_target), 1, 'academic year is searchable');
  perform t.expect_affected(format($q$update public.documents set college_university='SearchCollege' where id=%L$q$, v_target), 1, 'college update refreshes search vector');
  perform t.expect_count(format($q$select 1 from public.documents where id=%L and search_vector @@ plainto_tsquery('english','SearchCollege')$q$, v_target), 1, 'college is searchable');

  perform t.expect_count(format($q$select 1 from public.documents where id=%L and field_discipline='SearchDiscipline'$q$, v_target), 1, 'historical document metadata survives option changes');
  delete from public.document_metadata_options where field_key in ('field_discipline', 'course_program');
  delete from public.documents where id in (v_target, v_other, v_pending);
end $$;

do $$ begin
  perform t.as_user('00000000-0000-0000-0000-00000000000b');
  perform t.expect_count('select 1 from public.documents', 1, 'other student sees approved document');
  perform t.expect_affected($q$update public.documents set title='Pwned'$q$, 0, 'non-owner cannot edit document');
  perform t.expect_affected($q$delete from public.documents$q$, 0, 'non-owner cannot delete document');
  perform t.expect_count('select 1 from public.approved_uploaders', 1, 'approved_uploaders exposes uploader of approved doc');
  perform t.expect_error('select email from public.approved_uploaders', '42703', 'approved_uploaders does not expose email');
end $$;

do $$ begin
  perform t.as_user('00000000-0000-0000-0000-00000000000d');
  perform t.expect_count('select 1 from public.documents', 0, 'suspended user cannot see documents');
  perform t.expect_error($q$insert into public.documents (uploader_id,title,original_filename,storage_path,file_extension,mime_type,file_size,subject)
    values ('00000000-0000-0000-0000-00000000000d','x','x.pptx','d/1.pptx','pptx','m','1','s')$q$, '42501', 'suspended user cannot upload');
end $$;

-- ===== record_download =====
do $$
declare n int;
begin
  perform t.as_user('00000000-0000-0000-0000-00000000000b');
  perform t.expect_error($q$select public.record_download((select id from public.documents limit 1), '00000000-0000-0000-0000-00000000000b')$q$, '42501', 'authenticated cannot call record_download');
  perform t.as_postgres();
  perform t.as_service();
  select public.record_download((select id from public.documents limit 1), '00000000-0000-0000-0000-00000000000b') into n;
  if n <> 1 then raise exception 'FAIL: first download should return 1, got %', n; end if;
  select public.record_download((select id from public.documents limit 1), '00000000-0000-0000-0000-00000000000b') into n;
  if n <> 2 then raise exception 'FAIL: second download should return 2, got %', n; end if;
  raise notice 'ok   - service role records downloads atomically (1, 2)';
  perform t.expect_error($q$select public.record_download(gen_random_uuid(), '00000000-0000-0000-0000-00000000000b')$q$, 'P0002', 'unknown document is not downloadable');
end $$;

-- pending document must not be countable and must leave no trace
do $$
declare v_pending uuid;
begin
  perform t.as_postgres();
  insert into public.documents (uploader_id,title,original_filename,storage_path,file_extension,mime_type,file_size,subject)
  values ('00000000-0000-0000-0000-00000000000a','Pending one','p.docx','a/p.docx','docx','m','5','Math') returning id into v_pending;
  perform t.as_service();
  perform t.expect_error(format('select public.record_download(%L, %L)', v_pending, '00000000-0000-0000-0000-00000000000b'), 'P0002', 'pending document cannot be downloaded or counted');
  perform t.as_postgres();
  perform t.expect_count(format('select 1 from public.document_downloads where document_id = %L', v_pending), 0, 'failed download left no log row');
  perform t.expect_count(format('select 1 from public.documents where id = %L and download_count = 0', v_pending), 1, 'failed download left count at 0');
end $$;

do $$ begin
  perform t.as_user('00000000-0000-0000-0000-00000000000b');
  perform t.expect_count('select 1 from public.document_downloads', 2, 'student sees own download log');
  perform t.as_user('00000000-0000-0000-0000-00000000000a');
  perform t.expect_count('select 1 from public.document_downloads', 0, 'student cannot see others download log');
  perform t.expect_error($q$insert into public.document_downloads (document_id,user_id) select id, '00000000-0000-0000-0000-00000000000a' from public.documents limit 1$q$, '42501', 'students cannot insert download rows');
end $$;

-- ===== reports =====
do $$
declare v_doc uuid;
begin
  perform t.as_postgres();
  select id into v_doc from public.documents where title like 'Data Integration%';
  perform t.as_user('00000000-0000-0000-0000-00000000000b');
  perform t.expect_affected(format($q$insert into public.document_reports (document_id,reporter_id,reason) values (%L,'00000000-0000-0000-0000-00000000000b','spam')$q$, v_doc), 1, 'student can report visible document');
  perform t.expect_error(format($q$insert into public.document_reports (document_id,reporter_id,reason) values (%L,'00000000-0000-0000-0000-00000000000b','spam')$q$, v_doc), '23505', 'duplicate open report is rejected');
  perform t.expect_error(format($q$insert into public.document_reports (document_id,reporter_id,reason) values (%L,'00000000-0000-0000-0000-00000000000a','spam')$q$, v_doc), '42501', 'cannot report as another user');
  perform t.expect_error(format($q$insert into public.document_reports (document_id,reporter_id,reason,status) values (%L,'00000000-0000-0000-0000-00000000000b','other','resolved')$q$, v_doc), '42501', 'cannot insert pre-resolved report');
  perform t.expect_affected($q$update public.document_reports set status='resolved'$q$, 0, 'student cannot resolve reports');
  perform t.as_user('00000000-0000-0000-0000-00000000000a');
  perform t.expect_count('select 1 from public.document_reports', 0, 'other students cannot read reports');
  perform t.as_user('00000000-0000-0000-0000-00000000000c');
  perform t.expect_count('select 1 from public.document_reports', 1, 'admin can read reports');
  perform t.expect_affected($q$update public.document_reports set status='resolved', reviewed_by='00000000-0000-0000-0000-00000000000c', reviewed_at=now()$q$, 1, 'admin can resolve report');
  perform t.expect_error($q$update public.document_reports set reason='copyright'$q$, '42501', 'admin cannot rewrite report content');
end $$;

do $$
declare v_pending uuid;
begin
  perform t.as_postgres();
  select id into v_pending from public.documents where title = 'Pending one';
  perform t.as_user('00000000-0000-0000-0000-00000000000b');
  perform t.expect_error(format($q$insert into public.document_reports (document_id,reporter_id,reason) values (%L,'00000000-0000-0000-0000-00000000000b','spam')$q$, v_pending), '42501', 'cannot report a document you cannot see');
end $$;

-- ===== audit log =====
do $$ begin
  perform t.as_user('00000000-0000-0000-0000-00000000000c');
  perform t.expect_error($q$insert into public.admin_audit_logs (actor_id,action,target_type) values ('00000000-0000-0000-0000-00000000000c','x','y')$q$, '42501', 'admins cannot write audit rows through the API role');
  perform t.as_postgres();
  perform t.as_service();
  perform t.expect_affected($q$insert into public.admin_audit_logs (actor_id,action,target_type,target_id,details) values ('00000000-0000-0000-0000-00000000000c','document.approve','document','abc','{"note":"ok"}')$q$, 1, 'service role can append audit rows');
  perform t.expect_error($q$update public.admin_audit_logs set action='tampered'$q$, null, 'service role cannot update audit rows');
  perform t.as_postgres();
  perform t.expect_error($q$update public.admin_audit_logs set action='tampered'$q$, '42501', 'even postgres cannot update audit rows');
  perform t.expect_error($q$delete from public.admin_audit_logs$q$, '42501', 'even postgres cannot delete audit rows');
  perform t.as_user('00000000-0000-0000-0000-00000000000c');
  perform t.expect_count('select 1 from public.admin_audit_logs', 1, 'admin can read audit log');
  perform t.as_user('00000000-0000-0000-0000-00000000000a');
  perform t.expect_count('select 1 from public.admin_audit_logs', 0, 'student cannot read audit log');
end $$;

-- Deleting an account must not be blocked by (or erase) its audit trail
do $$ begin
  perform t.as_postgres();
  delete from auth.users where email = 'carol@uni.test';
  perform t.expect_count($q$select 1 from public.admin_audit_logs where action = 'document.approve' and actor_id is null$q$, 1,
    'deleting an admin keeps audit rows (actor becomes NULL)');
  perform t.expect_error($q$update public.admin_audit_logs set action = 'tampered'$q$, '42501', 'audit rows still immutable after actor deletion');
end $$;

\echo ALL SQL TESTS PASSED
