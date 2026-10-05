-- Encrypted cloud backups. The server only ever sees ciphertext. One owner per project.
create table public.backups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  size integer not null,
  salt text not null,
  iv text not null,
  ciphertext text not null,
  cipher_hash text not null,
  complete boolean not null default false  -- set true only after the app verifies the upload
);
create index backups_owner_created on public.backups (owner_id, created_at desc);
alter table public.backups enable row level security;
create policy backups_select on public.backups for select to authenticated using (owner_id = (select auth.uid()));
create policy backups_insert on public.backups for insert to authenticated with check (owner_id = (select auth.uid()));
create policy backups_update on public.backups for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy backups_delete on public.backups for delete to authenticated using (owner_id = (select auth.uid()));
revoke all on public.backups from anon;
