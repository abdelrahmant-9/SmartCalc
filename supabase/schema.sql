-- Heaven Manager: online sync schema for Supabase.
-- Run this once in: Supabase Dashboard -> SQL Editor -> New query -> Run.

create sequence if not exists records_seq;

create table if not exists public.records (
  tbl         text    not null,
  id          text    not null,
  data        jsonb   not null,
  updated_at  bigint  not null,
  deleted     boolean not null default false,
  device_id   text,
  server_seq  bigint  not null default nextval('records_seq'),
  primary key (tbl, id)
);

create index if not exists records_server_seq_idx on public.records (server_seq);

alter table public.records enable row level security;

drop policy if exists "authenticated read" on public.records;
create policy "authenticated read" on public.records
  for select to authenticated using (true);

drop policy if exists "authenticated write" on public.records;
create policy "authenticated write" on public.records
  for all to authenticated using (true) with check (true);

-- Upsert a batch of rows; a row is only replaced by a newer version (last write wins).
create or replace function public.push_records(rows jsonb)
returns void
language sql
security invoker
as $$
  insert into public.records (tbl, id, data, updated_at, deleted, device_id)
  select x.tbl, x.id, x.data, x.updated_at, coalesce(x.deleted, false), x.device_id
  from jsonb_to_recordset(rows) as x(tbl text, id text, data jsonb, updated_at bigint, deleted boolean, device_id text)
  on conflict (tbl, id) do update
    set data       = excluded.data,
        updated_at = excluded.updated_at,
        deleted    = excluded.deleted,
        device_id  = excluded.device_id,
        server_seq = nextval('records_seq')
    where public.records.updated_at < excluded.updated_at;
$$;

revoke all on function public.push_records(jsonb) from public, anon;
grant execute on function public.push_records(jsonb) to authenticated;
grant select, insert, update on public.records to authenticated;
grant usage on sequence records_seq to authenticated;
