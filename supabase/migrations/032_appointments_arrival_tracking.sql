-- 032_appointments_arrival_tracking.sql
-- Extends the session lifecycle (028) to match the Appointments page's
-- fuller flow: Confirmed -> Arrived -> Waiting -> In Service ->
-- Completed -> No-show/Cancelled. "registered" (walk-in-specific) is
-- folded into "arrived" — a walk-in has, by definition, just arrived.
-- arrival_time records when front desk marked someone as physically
-- on-site, used to compute waiting time and estimated completion.
alter table appointments add column if not exists arrival_time timestamptz;

update appointments set session_status = 'arrived' where session_status = 'registered';

alter table appointments drop constraint if exists appointments_session_status_check;
alter table appointments add constraint appointments_session_status_check
  check (session_status is null or session_status in ('arrived', 'waiting', 'in_service', 'completed', 'no_show'));
