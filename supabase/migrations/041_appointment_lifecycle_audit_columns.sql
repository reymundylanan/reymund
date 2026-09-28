-- 041_appointment_lifecycle_audit_columns.sql
-- Tracks which Front Desk user performed each key lifecycle action —
-- Confirm, Check In, and Mark Complete — alongside the timestamps that
-- already exist (confirmed via appointments.status, arrival_time,
-- completed_at). The appointment_history trigger already records the
-- "what changed and when"; these columns record the "who" for the
-- three actions the new Quick Actions workflow calls out explicitly.
alter table appointments add column if not exists confirmed_at timestamptz;
alter table appointments add column if not exists confirmed_by uuid references profiles(id) on delete set null;
alter table appointments add column if not exists checked_in_by uuid references profiles(id) on delete set null;
alter table appointments add column if not exists completed_by uuid references profiles(id) on delete set null;
