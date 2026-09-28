-- 036_staff_attendance_recorded_by.sql
-- Tracks which Front Desk user performed the most recent attendance
-- action, for the Attendance History page's "Recorded By" column.
alter table staff_attendance add column if not exists recorded_by uuid references profiles(id) on delete set null;
