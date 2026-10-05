-- Plain totals only (no customer data) so emailed reports can be built while backups stay encrypted.
create table public.report_summary (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  summary jsonb not null
);
create table public.report_settings (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  recipients text[] not null default '{}',
  weekly boolean not null default false,
  monthly boolean not null default false,
  yearly boolean not null default false,
  send_hour integer not null default 8 check (send_hour between 0 and 23)
);
create table public.report_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  period text not null,
  status text not null,
  detail text not null default ''
);
alter table public.report_summary enable row level security;
alter table public.report_settings enable row level security;
alter table public.report_log enable row level security;
create policy rs_all on public.report_summary for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy rset_all on public.report_settings for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
-- The owner can read the sent history. Only the Edge Function (service role) writes it.
create policy rlog_select on public.report_log for select to authenticated using (owner_id = (select auth.uid()));
revoke all on public.report_summary, public.report_settings, public.report_log from anon;
