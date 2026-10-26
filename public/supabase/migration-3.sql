-- users can update their own message reads
-- (it no longer throws an error when they try
-- and mark a message as read that was already read)
create policy "Users can update own message_reads"
on public.message_reads
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));