-- Newsletter campaign list
-- Run once in the Supabase SQL editor for the project the website and the
-- volunteer portal share. Safe to re-run.

create table if not exists public.newsletter_campaign (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  status      text not null default 'subscribed'
              check (status in ('subscribed', 'removed')),
  source      text not null default 'public_form'
              check (source in ('public_form', 'admin_manual', 'admin_removed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One row per email, case-insensitive
create unique index if not exists newsletter_campaign_email_uniq
  on public.newsletter_campaign (lower(email));

-- Lock the table down. Anonymous visitors get NO direct table access;
-- only admins (via the volunteer portal) can read/insert/update/delete.
alter table public.newsletter_campaign enable row level security;

drop policy if exists "newsletter admin all" on public.newsletter_campaign;
create policy "newsletter admin all"
  on public.newsletter_campaign
  for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Public signup entry point, called by the website homepage form via
-- supabase.rpc('subscribe_newsletter', { p_email }). It runs with the
-- function owner's rights, so the website can ADD an email without being
-- able to read the list. A person who signs up again after being removed
-- is put back on the list.
create or replace function public.subscribe_newsletter(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(p_email));
begin
  if v_email is null
     or length(v_email) > 254
     or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    raise exception 'invalid_email';
  end if;

  insert into public.newsletter_campaign (email, status, source)
  values (v_email, 'subscribed', 'public_form')
  on conflict (lower(email)) do update
    set status = 'subscribed', updated_at = now();
end;
$$;

revoke all on function public.subscribe_newsletter(text) from public;
grant execute on function public.subscribe_newsletter(text) to anon, authenticated;