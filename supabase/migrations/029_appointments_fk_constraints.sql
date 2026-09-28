-- 029_appointments_fk_constraints.sql
-- professional_id/service_id existed on appointments as plain uuid
-- columns but were never given real foreign key constraints (they were
-- never populated before 028, so this never surfaced). Without a
-- declared FK, PostgREST can't resolve embed syntax like
-- `professional:staff_members(full_name)` — this is what
-- getTodaysWalkins failed on. on delete set null so removing a staff
-- member or service later doesn't cascade-delete real appointment
-- history.
do $$ begin
  alter table appointments
    add constraint appointments_professional_id_fkey
    foreign key (professional_id) references staff_members(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table appointments
    add constraint appointments_service_id_fkey
    foreign key (service_id) references branch_services(id) on delete set null;
exception when duplicate_object then null; end $$;
