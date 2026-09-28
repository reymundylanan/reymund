-- 038_staff_attendance_status_values.sql
-- The Staff Schedule page now drives Punch In/Out and Start/End Break
-- directly (replacing the old separate Attendance page). Aligns
-- staff_attendance.status with the six statuses shown there: scheduled,
-- available, in_service, on_break, out. "Day Off" is intentionally not
-- stored here — it's derived from staff_shifts, same as before.
--
-- Existing 'absent' rows (from the old manual Present/Absent marking
-- feature) fall back to 'scheduled' since nobody's punched in yet today.
-- Existing 'in' rows become 'available' (renamed for clarity).
update staff_attendance set status = 'scheduled' where status = 'absent';
update staff_attendance set status = 'available' where status = 'in';

do $$ begin
  alter table staff_attendance drop constraint if exists staff_attendance_status_check;
  alter table staff_attendance add constraint staff_attendance_status_check
    check (status in ('scheduled', 'available', 'in_service', 'on_break', 'out'));
exception when others then null; end $$;
