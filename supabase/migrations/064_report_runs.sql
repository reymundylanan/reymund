-- 064_report_runs.sql
-- Admin → Reports → Recent Reports: a log of exported reports with the
-- settings used, so a report can be opened or downloaded again (it is
-- regenerated from current data with the same settings).

create table if not exists report_runs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 160),
  report_type text not null check (length(report_type) <= 40),
  params jsonb not null default '{}'::jsonb,
  format text not null check (format in ('pdf', 'excel', 'csv', 'word')),
  generated_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists report_runs_created_idx on report_runs (created_at desc);

alter table report_runs enable row level security;

drop policy if exists "admin manage report_runs" on report_runs;
create policy "admin manage report_runs" on report_runs for all
  using (coalesce(public.current_user_role()::text, '') = 'admin')
  with check (coalesce(public.current_user_role()::text, '') = 'admin');

grant select, insert, delete on report_runs to authenticated;

notify pgrst, 'reload schema';
