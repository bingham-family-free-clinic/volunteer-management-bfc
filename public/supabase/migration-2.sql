-- Volunteer-facing onboarding document uploads
--
-- 1. Adds onboarding_checklists.volunteer_uploads so the admin pipeline can
--    flag files that were uploaded by the volunteer. Existing rows get an
--    empty array, which is interpreted as "uploaded by an admin".
-- 2. Adds an RPC that lets a volunteer write only the file path for their own
--    onboarding row (never the admin approval booleans).
-- 3. Adds SELECT access so volunteers can read their own checklist state.
-- 4. Adds storage policies for the five volunteer-upload buckets, scoped to
--    the applicant's own folder (<application id>/...).

-- ─── 1. Uploader tracking ────────────────────────────────────────────────────
alter table public.onboarding_checklists
  add column if not exists volunteer_uploads text[] not null default '{}';

comment on column public.onboarding_checklists.volunteer_uploads is
  'Checklist item keys whose current file was uploaded by the volunteer. Empty/missing key = admin upload.';

-- ─── 2. Volunteer write RPC ──────────────────────────────────────────────────
create or replace function public.volunteer_set_checklist_file(
  p_applicant_id uuid,
  p_item_key text,
  p_url text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_app   record;
  v_required text[];
begin
  if v_email = '' then
    raise exception 'Not authenticated';
  end if;

  if p_url is null or length(trim(p_url)) = 0 then
    raise exception 'Missing file path';
  end if;

  if p_url not like (p_applicant_id::text || '/%') then
    raise exception 'Invalid file path';
  end if;

  if p_item_key not in (
    'background_check', 'id_check', 'immunization', 'tb_test', 'licenses_certifications'
  ) then
    raise exception 'Unknown document type';
  end if;

  select id, stage, onboard_affiliation, onboard_default_role
    into v_app
    from public.volunteer_applications
   where id = p_applicant_id
     and lower(email) = v_email;

  if v_app.id is null then
    raise exception 'Application not found';
  end if;

  if v_app.stage <> 'onboarding' then
    raise exception 'Document uploads are only available during onboarding';
  end if;

  if v_app.onboard_affiliation = 'missionary' then
    v_required := array['id_check'];
  elsif v_app.onboard_default_role in ('Information Systems', 'Communications') then
    v_required := array['background_check', 'id_check'];
  else
    v_required := array['background_check', 'id_check', 'immunization', 'tb_test'];
  end if;

  if v_app.onboard_affiliation is not null
     and v_app.onboard_default_role is not null
     and p_item_key <> 'licenses_certifications'
     and not (p_item_key = any (v_required)) then
    raise exception 'This document is not required for your position';
  end if;

  insert into public.onboarding_checklists (
    applicant_id,
    background_check,
    id_check,
    immunization,
    tb_test,
    licenses_certifications,
    volunteer_uploads
  )
  values (p_applicant_id, false, false, false, false, false, '{}')
  on conflict (applicant_id) do nothing;

  if exists (
    select 1
      from public.onboarding_checklists c
     where c.applicant_id = p_applicant_id
       and case p_item_key
             when 'background_check'        then c.background_check
             when 'id_check'                then c.id_check
             when 'immunization'            then c.immunization
             when 'tb_test'                 then c.tb_test
             when 'licenses_certifications' then c.licenses_certifications
           end
  ) then
    raise exception 'This document has already been approved';
  end if;

  update public.onboarding_checklists
     set background_check_url = case when p_item_key = 'background_check' then p_url else background_check_url end,
         id_check_url         = case when p_item_key = 'id_check' then p_url else id_check_url end,
         immunization_url     = case when p_item_key = 'immunization' then p_url else immunization_url end,
         tb_test_url          = case when p_item_key = 'tb_test' then p_url else tb_test_url end,
         licenses_url         = case when p_item_key = 'licenses_certifications' then p_url else licenses_url end,
         volunteer_uploads    = array(
           select distinct k
             from unnest(coalesce(volunteer_uploads, '{}'::text[]) || array[p_item_key]) as t(k)
         ),
         updated_at = now()
   where applicant_id = p_applicant_id;
end;
$$;

revoke all on function public.volunteer_set_checklist_file(uuid, text, text) from public;
grant execute on function public.volunteer_set_checklist_file(uuid, text, text) to authenticated;

-- ─── 3. Volunteer read access ────────────────────────────────────────────────
alter table public.onboarding_checklists enable row level security;

drop policy if exists "Volunteers can read own onboarding checklist" on public.onboarding_checklists;
create policy "Volunteers can read own onboarding checklist"
  on public.onboarding_checklists
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.volunteer_applications va
       where va.id = onboarding_checklists.applicant_id
         and lower(va.email) = lower(auth.jwt() ->> 'email')
    )
  );

-- ─── 4. Volunteer storage access ─────────────────────────────────────────────
-- Files are written to <application id>/<item key>-<timestamp>.zip by
-- app/volunteer/page.js, matching the admin pipeline's path scheme.

drop policy if exists "Volunteers can read own onboarding documents" on storage.objects;
create policy "Volunteers can read own onboarding documents"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = any (array[
      'onboarding-background-checks',
      'onboarding-ids',
      'onboarding-immunizations',
      'onboarding-tb-tests',
      'onboarding-licenses'
    ])
    and exists (
      select 1
        from public.volunteer_applications va
       where va.id::text = (storage.foldername(name))[1]
         and lower(va.email) = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists "Volunteers can upload own onboarding documents" on storage.objects;
create policy "Volunteers can upload own onboarding documents"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = any (array[
      'onboarding-background-checks',
      'onboarding-ids',
      'onboarding-immunizations',
      'onboarding-tb-tests',
      'onboarding-licenses'
    ])
    and exists (
      select 1
        from public.volunteer_applications va
       where va.id::text = (storage.foldername(name))[1]
         and lower(va.email) = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists "Volunteers can update own onboarding documents" on storage.objects;
create policy "Volunteers can update own onboarding documents"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = any (array[
      'onboarding-background-checks',
      'onboarding-ids',
      'onboarding-immunizations',
      'onboarding-tb-tests',
      'onboarding-licenses'
    ])
    and exists (
      select 1
        from public.volunteer_applications va
       where va.id::text = (storage.foldername(name))[1]
         and lower(va.email) = lower(auth.jwt() ->> 'email')
    )
  )
  with check (
    bucket_id = any (array[
      'onboarding-background-checks',
      'onboarding-ids',
      'onboarding-immunizations',
      'onboarding-tb-tests',
      'onboarding-licenses'
    ])
    and exists (
      select 1
        from public.volunteer_applications va
       where va.id::text = (storage.foldername(name))[1]
         and lower(va.email) = lower(auth.jwt() ->> 'email')
    )
  );
