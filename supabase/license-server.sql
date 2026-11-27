-- Heaven license server: lets the vendor suspend, resume and renew customers online.
-- Run once in YOUR OWN Supabase project (not a customer's): SQL Editor -> New query -> Run.
-- Then: Authentication -> Providers -> Email -> turn OFF "Allow new users to sign up",
-- and add one user for yourself (Authentication -> Users -> Add user, Auto Confirm).

create table if not exists public.licenses (
  cid        text primary key,     -- customer id from the vendor app
  key        text,                 -- latest signed license key
  status     text,                 -- signed suspend/resume status
  updated_at timestamptz not null default now()
);

alter table public.licenses enable row level security;

-- Only the vendor (a logged-in user) can read or change rows.
drop policy if exists "vendor full access" on public.licenses;
create policy "vendor full access" on public.licenses for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.licenses to authenticated;

-- Customer apps ask about their own customer id only, and can't list anyone else.
create or replace function public.license_status(p_cid text)
returns table (key text, status text)
language sql
security definer
set search_path = public
as $$
  select l.key, l.status from public.licenses l where l.cid = p_cid;
$$;

revoke all on function public.license_status(text) from public;
grant execute on function public.license_status(text) to anon, authenticated;
