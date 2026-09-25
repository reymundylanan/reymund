-- 022_recreate_leave_requests.sql
-- Re-adds the leave_requests table (dropped in 021) since the admin
-- "Leave" action is back. Created directly in its final shape (the
-- combined result of the original 017 + 018 migrations): individually
-- picked days via a dates array, not a continuous start/end range.
create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_member_id uuid not null references staff_members(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  dates date[] not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint leave_requests_dates_count check (cardinality(dates) between 1 and 7)
);

alter table leave_requests enable row level security;

drop policy if exists "front_desk submit and view leave_requests" on leave_requests;
create policy "front_desk submit and view leave_requests" on leave_requests for select
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'front_desk')
  );

drop policy if exists "front_desk insert leave_requests" on leave_requests;
create policy "front_desk insert leave_requests" on leave_requests for insert
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'front_desk')
  );

drop policy if exists "admin manage leave_requests" on leave_requests;
create policy "admin manage leave_requests" on leave_requests for all
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
