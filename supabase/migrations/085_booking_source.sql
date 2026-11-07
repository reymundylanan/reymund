-- 085_booking_source.sql
-- How a booking came in. The Front Desk records it when it books for a
-- client who called, messaged on Facebook or asked in person; older and
-- website bookings stay empty.

alter table appointments add column if not exists booking_source text;

alter table appointments drop constraint if exists appointments_booking_source_check;
alter table appointments add constraint appointments_booking_source_check
  check (booking_source is null or booking_source in ('website', 'phone', 'facebook', 'in_person', 'other'));
