create or replace function public.is_office_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.default_role = 'Office Manager'
      and coalesce(p.status, 'active') = 'active'
  );
$$;

revoke all on function public.is_office_manager() from public;
revoke all on function public.is_office_manager() from anon;
grant execute on function public.is_office_manager() to authenticated;

drop policy if exists "office_manager read profiles" on public.profiles;
create policy "office_manager read profiles"
  on public.profiles
  for select
  to authenticated
  using ((select public.is_office_manager()));

drop policy if exists "office_manager read schedule" on public.schedule;
create policy "office_manager read schedule"
  on public.schedule
  for select
  to authenticated
  using ((select public.is_office_manager()));

drop policy if exists "office_manager read shifts" on public.shifts;
create policy "office_manager read shifts"
  on public.shifts
  for select
  to authenticated
  using ((select public.is_office_manager()));

drop policy if exists "office_manager read callouts" on public.callouts;
create policy "office_manager read callouts"
  on public.callouts
  for select
  to authenticated
  using ((select public.is_office_manager()));
drop policy if exists "office_manager read attendance_records" on public.attendance_records;
create policy "office_manager read attendance_records"
  on public.attendance_records
  for select
  to authenticated
  using ((select public.is_office_manager()));

drop policy if exists "office_manager read weekly_training_acknowledgments" on public.weekly_training_acknowledgments;
create policy "office_manager read weekly_training_acknowledgments"
  on public.weekly_training_acknowledgments
  for select
  to authenticated
  using ((select public.is_office_manager()));


drop policy if exists "office_manager read weekly_trainings" on public.weekly_trainings;
create policy "office_manager read weekly_trainings"
  on public.weekly_trainings
  for select
  to authenticated
  using ((select public.is_office_manager()));

drop policy if exists "office_manager insert weekly_trainings" on public.weekly_trainings;
create policy "office_manager insert weekly_trainings"
  on public.weekly_trainings
  for insert
  to authenticated
  with check ((select public.is_office_manager()));

drop policy if exists "office_manager update weekly_trainings" on public.weekly_trainings;
create policy "office_manager update weekly_trainings"
  on public.weekly_trainings
  for update
  to authenticated
  using ((select public.is_office_manager()))
  with check ((select public.is_office_manager()));

drop policy if exists "office_manager read guest_organizations" on public.guest_organizations;
create policy "office_manager read guest_organizations"
  on public.guest_organizations
  for select
  to authenticated
  using ((select public.is_office_manager()));

drop policy if exists "office_manager read guest_hours_submissions" on public.guest_hours_submissions;
create policy "office_manager read guest_hours_submissions"
  on public.guest_hours_submissions
  for select
  to authenticated
  using ((select public.is_office_manager()));

drop policy if exists "office_manager read provider_recurring_schedule" on public.provider_recurring_schedule;
create policy "office_manager read provider_recurring_schedule"
  on public.provider_recurring_schedule
  for select
  to authenticated
  using ((select public.is_office_manager()));

drop policy if exists "office_manager read provider_shifts" on public.provider_shifts;
create policy "office_manager read provider_shifts"
  on public.provider_shifts
  for select
  to authenticated
  using ((select public.is_office_manager()));

drop policy if exists "office_manager read provider_callouts" on public.provider_callouts;
create policy "office_manager read provider_callouts"
  on public.provider_callouts
  for select
  to authenticated
  using ((select public.is_office_manager()));

drop policy if exists "office_manager read avatars" on storage.objects;
create policy "office_manager read avatars"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (select public.is_office_manager())
  );
