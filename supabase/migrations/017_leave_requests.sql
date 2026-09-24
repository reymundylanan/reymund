-- 017_leave_requests.sql
-- Front desk submits leave requests on behalf of staff; only admin can
-- approve or deny them. Approving a request is expected to create
-- "full_day" staff_shifts rows for each date in the range (handled by
-- app code, not this migration).
create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_member_id uuid not null references staff_members(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint leave_requests_date_range check (end_date >= start_date)
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
