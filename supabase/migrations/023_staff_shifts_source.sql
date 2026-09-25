-- 023_staff_shifts_source.sql
-- Tags each staff_shifts row with why it exists ('manual', 'leave', or
-- 'transfer'), so the booking flow can tell "this block only exists
-- because of a branch transfer" apart from a genuine leave/manual
-- day-off on the same date. This is a hard requirement now, not just
-- for Leave: every write to staff_shifts (including the existing "Add
-- Day Off" feature) now includes this column, so it must exist before
-- ANY of those features keep working.
alter table staff_shifts add column if not exists source text not null default 'manual';

do $$ begin
  alter table staff_shifts
    add constraint staff_shifts_source_check
    check (source in ('manual', 'leave', 'transfer'));
exception when duplicate_object then null; end $$;

-- Needed for the front desk notification bell's new "X is on leave"
-- listener to actually fire.
do $$ begin
  alter publication supabase_realtime add table staff_shifts;
exception when duplicate_object then null; end $$;
