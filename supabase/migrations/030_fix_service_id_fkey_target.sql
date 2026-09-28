-- 030_fix_service_id_fkey_target.sql
-- 029 was meant to point appointments.service_id at branch_services(id)
-- (the table the app actually queries for real service data), but the
-- constraint that got created references a different table named
-- "services" instead — causing every valid branch_services id to fail
-- the FK check. Drop and recreate it against the correct table.
alter table appointments drop constraint if exists appointments_service_id_fkey;

alter table appointments
  add constraint appointments_service_id_fkey
  foreign key (service_id) references branch_services(id) on delete set null;
