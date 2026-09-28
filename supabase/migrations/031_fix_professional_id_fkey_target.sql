-- 031_fix_professional_id_fkey_target.sql
-- Same issue as 030: this constraint ended up referencing a table
-- named "professionals" instead of "staff_members" (the table the app
-- actually queries for real staff data).
alter table appointments drop constraint if exists appointments_professional_id_fkey;

alter table appointments
  add constraint appointments_professional_id_fkey
  foreign key (professional_id) references staff_members(id) on delete set null;
