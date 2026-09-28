-- 039_staff_attendance_updated_at.sql
-- Tracks when a staff member's live status last changed, for the
-- Staff Schedule detail panel's "Last updated" display.
alter table staff_attendance add column if not exists updated_at timestamptz not null default now();
