-- 016_staff_shift_availability.sql
-- Fix the FK: staff_shifts must reference staff_members, not the dead
-- professionals table. Table has 0 rows, so this is safe.
alter table staff_shifts drop constraint if exists staff_shifts_professional_id_fkey;
alter table staff_shifts rename column professional_id to staff_member_id;
alter table staff_shifts
  add constraint staff_shifts_staff_member_id_fkey
  foreign key (staff_member_id) references staff_members(id) on delete cascade;

-- Replace the old working/break/off status with a period concept.
alter table staff_shifts drop column if exists status;
alter table staff_shifts drop column if exists start_time;
alter table staff_shifts drop column if exists end_time;
alter table staff_shifts add column if not exists period text not null default 'full_day';

do $$ begin
  alter table staff_shifts
    add constraint staff_shifts_period_check
    check (period in ('full_day', 'morning', 'afternoon'));
exception when duplicate_object then null; end $$;

-- One off-record per staff member per date — lets the app upsert atomically
-- instead of a delete-then-insert (which could lose a block if the insert
-- half failed after the delete half succeeded).
do $$ begin
  alter table staff_shifts
    add constraint staff_shifts_member_date_unique
    unique (staff_member_id, shift_date);
exception when duplicate_object then null; end $$;

alter table staff_shifts enable row level security;

drop policy if exists "public read staff_shifts" on staff_shifts;
create policy "public read staff_shifts" on staff_shifts for select using (true);

drop policy if exists "staff manage staff_shifts" on staff_shifts;
create policy "staff manage staff_shifts" on staff_shifts for all
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'front_desk')
  )
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'front_desk')
  );
