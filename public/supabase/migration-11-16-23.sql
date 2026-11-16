-- Allow providers to delete their own callout records (e.g. to re-schedule after calling out)
-- Run in the Supabase SQL editor for this project. Safe to re-run.

alter table public.provider_callouts enable row level security;

drop policy if exists "Providers can delete own callouts" on public.provider_callouts;
create policy "Providers can delete own callouts"
  on public.provider_callouts
  for delete
  to authenticated
  using (provider_id = auth.uid());
