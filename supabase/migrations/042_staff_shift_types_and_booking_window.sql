-- 042_staff_shift_types_and_booking_window.sql
-- Standard staff shifts (Opener/Midshift/Closer) and the separate,
-- global client appointment booking window. These are deliberately two
-- different concepts: a Closer's shift running to 7 PM is a staff
-- operations fact, not permission for clients to book a 7 PM start.
alter table staff_members add column if not exists shift_type text check (shift_type in ('opener', 'midshift', 'closer'));

alter table spa_settings add column if not exists booking_window_start time not null default '08:00';
alter table spa_settings add column if not exists booking_window_end time not null default '18:00';
