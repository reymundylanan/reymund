-- 023_staff_shifts_source_and_realtime.sql
-- Tags each staff_shifts row with why it exists, so the booking flow can
-- tell "this block only exists because of a branch transfer" apart from
-- a genuine leave/manual day-off on the same date. Without this, marking
-- someone on leave on a date that's also inside an active transfer had
-- no visible effect at the branch they were transferred to — the row
-- looked identical either way.
alter table staff_shifts add column if not exists source text not null default 'manual';

do $$ begin
  alter table staff_shifts
    add constraint staff_shifts_source_check
    check (source in ('manual', 'leave', 'transfer'));
exception when duplicate_object then null; end $$;

-- Ensure the tables the front desk notification bell now listens to are
-- actually part of the realtime publication — without this the new
-- listeners silently never fire.
do $$ begin
  alter publication supabase_realtime add table staff_shifts;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table branch_transfer_requests;
exception when duplicate_object then null; end $$;
