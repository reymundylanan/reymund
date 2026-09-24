-- 019_branch_transfer_requests.sql
-- Front desk requests borrowing a staff member from another branch to
-- work at their own branch temporarily, on up to 15 individually picked
-- days. Only admin can approve or deny (mirrors leave_requests). What
-- an approval actually does to bookability at either branch is left for
-- a later pass (app code, once the admin approve/deny screen exists).
create table if not exists branch_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  staff_member_id uuid not null references staff_members(id) on delete cascade,
  target_branch_id uuid not null references branches(id) on delete cascade,
  dates date[] not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint branch_transfer_requests_dates_count check (cardinality(dates) between 1 and 15)
);

alter table branch_transfer_requests enable row level security;

drop policy if exists "front_desk submit and view branch_transfer_requests" on branch_transfer_requests;
create policy "front_desk submit and view branch_transfer_requests" on branch_transfer_requests for select
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'front_desk')
  );

drop policy if exists "front_desk insert branch_transfer_requests" on branch_transfer_requests;
create policy "front_desk insert branch_transfer_requests" on branch_transfer_requests for insert
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'front_desk')
  );

drop policy if exists "admin manage branch_transfer_requests" on branch_transfer_requests;
create policy "admin manage branch_transfer_requests" on branch_transfer_requests for all
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
