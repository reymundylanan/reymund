-- 035_staff_attendance.sql
-- New attendance-tracking layer for Front Desk: distinct from staff_shifts
-- (which only tracks whole/half-day off-blocks for booking purposes).
-- One row per staff member per date; a separate breaks table holds each
-- individual break period so "break records" can be listed, not just summed.

create table if not exists staff_attendance (
  id uuid primary key default gen_random_uuid(),
  staff_member_id uuid not null references staff_members(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  attendance_date date not null,
  shift_start time not null default '09:00',
  shift_end time not null default '18:00',
  status text not null default 'scheduled',
  time_in timestamptz,
  time_out timestamptz,
  break_minutes integer not null default 0,
  created_at timestamptz not null default now()
);

do $$ begin
  alter table staff_attendance
    add constraint staff_attendance_status_check
    check (status in ('scheduled', 'in', 'out', 'absent', 'on_break'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table staff_attendance
    add constraint staff_attendance_member_date_unique
    unique (staff_member_id, attendance_date);
exception when duplicate_object then null; end $$;

create table if not exists staff_attendance_breaks (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references staff_attendance(id) on delete cascade,
  break_start timestamptz not null default now(),
  break_end timestamptz
);

alter table staff_attendance enable row level security;

drop policy if exists "front desk manage staff_attendance" on staff_attendance;
create policy "front desk manage staff_attendance" on staff_attendance for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'front_desk' and p.branch_id = staff_attendance.branch_id
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'front_desk' and p.branch_id = staff_attendance.branch_id
    )
  );

drop policy if exists "admin read staff_attendance" on staff_attendance;
create policy "admin read staff_attendance" on staff_attendance for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

alter table staff_attendance_breaks enable row level security;

drop policy if exists "front desk manage staff_attendance_breaks" on staff_attendance_breaks;
create policy "front desk manage staff_attendance_breaks" on staff_attendance_breaks for all
  using (
    exists (
      select 1 from staff_attendance sa
      join profiles p on p.id = auth.uid()
      where sa.id = staff_attendance_breaks.attendance_id
        and p.role = 'front_desk' and p.branch_id = sa.branch_id
    )
  )
  with check (
    exists (
      select 1 from staff_attendance sa
      join profiles p on p.id = auth.uid()
      where sa.id = staff_attendance_breaks.attendance_id
        and p.role = 'front_desk' and p.branch_id = sa.branch_id
    )
  );

drop policy if exists "admin read staff_attendance_breaks" on staff_attendance_breaks;
create policy "admin read staff_attendance_breaks" on staff_attendance_breaks for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

do $$ begin
  alter publication supabase_realtime add table staff_attendance;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table staff_attendance_breaks;
exception when duplicate_object then null; end $$;
