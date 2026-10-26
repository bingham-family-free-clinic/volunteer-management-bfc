create policy "Volunteers can read own application"
on public.volunteer_applications
for select
to authenticated
using (id = (select auth.uid()));